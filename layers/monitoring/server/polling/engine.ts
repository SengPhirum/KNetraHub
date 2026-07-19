import { getMonitoringDb as getDb } from '~~/server/utils/moduleDb'
import { SnmpClient } from '../snmp/engine'
import { resolveSnmpConfig } from '../core/credentials'
import { getPollerModules, getOs, type DeviceRow, type ModuleContext } from '../core/registry'
import { resolveEnabledModules, activeMaintenance } from '../core/moduleSettings'
import { AttemptBuffer } from '../core/attempts'
// Module registration side-effects
import '../definitions/os'
import './modules'

/**
 * Polling engine: collect current values for every entity discovery defined.
 * Same audit discipline as discovery — persisted collection plan, per-item
 * outcomes, per-module rollups, and an explicit complete/incomplete verdict.
 */
export async function runPoll(deviceId: number, jobId: number | null = null): Promise<{ runId: number; status: string }> {
  const db = getDb()
  const started = Date.now()

  const devRes = await db.query('SELECT * FROM monitoring.devices WHERE id = $1', [deviceId])
  const device = devRes.rows[0] as DeviceRow | undefined
  if (!device) throw new Error(`device ${deviceId} not found`)

  const { getSettingNumber } = await import('../core/settings')
  const intervalSec = Number(device.poll_interval_seconds ?? await getSettingNumber(db, 'poll_interval_seconds'))

  const maint = await activeMaintenance(db, deviceId)
  if (maint?.behavior === 'skip_polling') {
    await db.query(
      `UPDATE monitoring.devices SET status = 'maintenance', status_reason = 'maintenance window (polling skipped)',
         next_poll_at = now() + make_interval(secs => $2), updated_at = now() WHERE id = $1`,
      [deviceId, intervalSec]
    )
    const runRes = await db.query(
      `INSERT INTO monitoring.poll_runs (job_id, device_id, kind, status, plan, finished_at)
       VALUES ($1,$2,'poll','complete','{"skipped":"maintenance"}', now()) RETURNING id`,
      [jobId, deviceId]
    )
    return { runId: Number(runRes.rows[0].id), status: 'complete' }
  }

  const os = getOs(device.os_override || device.os)
  const modules = getPollerModules()
  const enabled = await resolveEnabledModules(db, device, os, 'poll', modules)

  const plan = {
    kind: 'poll',
    device: device.hostname,
    os: os.os,
    snmp: !device.snmp_disabled,
    intervalSeconds: intervalSec,
    inMaintenance: !!maint,
    modules: modules.map((m) => ({
      name: m.name,
      enabled: enabled.get(m.name)?.enabled ?? false,
      source: enabled.get(m.name)?.source ?? 'default',
      skipReason: device.snmp_disabled && m.requiresSnmp ? 'device is ICMP-only' : undefined
    }))
  }

  const runRes = await db.query(
    `INSERT INTO monitoring.poll_runs (job_id, device_id, kind, poller_node, plan)
     VALUES ($1,$2,'poll',$3,$4) RETURNING id`,
    [jobId, deviceId, process.env.NUXT_MONITORING_POLLER_NAME || null, JSON.stringify(plan)]
  )
  const runId = Number(runRes.rows[0].id)
  const attempts = new AttemptBuffer(db, runId, deviceId)

  let snmp: SnmpClient | null = null
  if (!device.snmp_disabled) {
    const cfg = await resolveSnmpConfig(db, device)
    if (cfg) {
      try {
        snmp = new SnmpClient(cfg)
      } catch (err: any) {
        attempts.record('system', 'snmp-session', 'failed', String(err?.message ?? err))
      }
    }
  }

  let anyFailed = false
  let deviceUnreachable = false
  try {
    for (const mod of modules) {
      const modEnabled = enabled.get(mod.name)
      if (!modEnabled?.enabled) {
        await insertModuleRun(db, runId, mod.name, 'skipped', { skipReason: `disabled (${modEnabled?.source ?? 'default'})` })
        continue
      }
      if (mod.requiresSnmp && !snmp) {
        await insertModuleRun(db, runId, mod.name, 'skipped', { skipReason: device.snmp_disabled ? 'device is ICMP-only' : 'no SNMP session' })
        continue
      }
      // Once the availability module declared the device unreachable, the
      // remaining SNMP modules are skipped-with-reason (they'd all time out) —
      // recorded, never silent.
      if (deviceUnreachable && mod.requiresSnmp) {
        const modAttempt = attempts.recorderFor(mod.name)
        modAttempt('module', 'skipped', 'device unreachable (ICMP down)')
        await insertModuleRun(db, runId, mod.name, 'skipped', { skipReason: 'device unreachable (ICMP down)' })
        continue
      }

      const modStart = Date.now()
      const before = attempts.summary()
      const ctx: ModuleContext & { intervalSec: number } = {
        db,
        device,
        snmp,
        os,
        record: attempts.recorderFor(mod.name),
        log: (msg) => console.log(`[monitoring:poll:${mod.name}] ${device.hostname}: ${msg}`),
        intervalSec
      }
      try {
        const result = await mod.run(ctx)
        if (result.status === 'failed') anyFailed = true
        if (mod.name === 'availability' && (result as any).deviceDown) deviceUnreachable = true
        const after = attempts.summary()
        await insertModuleRun(db, runId, mod.name, result.status, {
          error: result.error,
          durationMs: Date.now() - modStart,
          counts: diffCounts(before, after)
        })
      } catch (err: any) {
        anyFailed = true
        attempts.record(mod.name, 'module-run', 'failed', String(err?.message ?? err))
        await insertModuleRun(db, runId, mod.name, 'failed', { error: String(err?.message ?? err), durationMs: Date.now() - modStart })
      }
    }
  } finally {
    snmp?.close()
    await attempts.flush()
  }

  const sum = attempts.summary()
  const status = anyFailed || sum.failed > 0 ? 'incomplete' : 'complete'
  await db.query(
    `UPDATE monitoring.poll_runs SET finished_at = now(), status = $2,
       planned_items = $3, succeeded_items = $4, empty_items = $5,
       unsupported_items = $6, skipped_items = $7, failed_items = $8
     WHERE id = $1`,
    [runId, status, sum.planned, sum.succeeded, sum.empty, sum.unsupported, sum.skipped, sum.failed]
  )

  const durationMs = Date.now() - started
  await db.query(
    `UPDATE monitoring.devices SET
       last_polled_at = now(), last_poll_duration_ms = $2,
       next_poll_at = now() + make_interval(secs => $3),
       status_reason = CASE WHEN $4 = 'incomplete' THEN 'last poll incomplete — see Data Collection' ELSE NULL END,
       updated_at = now()
     WHERE id = $1`,
    [deviceId, durationMs, intervalSec, status]
  )

  return { runId, status }
}

async function insertModuleRun(
  db: ReturnType<typeof getDb>,
  runId: number,
  module: string,
  status: string,
  extra: { skipReason?: string; error?: string; durationMs?: number; counts?: Record<string, number> } = {}
): Promise<void> {
  const c = extra.counts ?? {}
  await db.query(
    `INSERT INTO monitoring.module_runs (run_id, module, status, skip_reason, error, duration_ms,
       planned_items, succeeded_items, empty_items, unsupported_items, skipped_items, failed_items)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [runId, module, status, extra.skipReason ?? null, extra.error ?? null, extra.durationMs ?? null,
      c.planned ?? 0, c.succeeded ?? 0, c.empty ?? 0, c.unsupported ?? 0, c.skipped ?? 0, c.failed ?? 0]
  )
}

function diffCounts(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of ['planned', 'succeeded', 'empty', 'unsupported', 'skipped', 'failed']) {
    out[key] = (after[key] ?? 0) - (before[key] ?? 0)
  }
  return out
}
