import { getDb } from '~~/server/utils/db'
import { SnmpClient } from '../snmp/engine'
import { resolveSnmpConfig } from '../core/credentials'
import { getDiscoveryModules, getOs, type DeviceRow, type ModuleContext } from '../core/registry'
import { resolveEnabledModules } from '../core/moduleSettings'
import { AttemptBuffer } from '../core/attempts'
import { recordEvent } from '../core/events'
// Module registration side-effects
import '../definitions/os'
import './modules'

/**
 * Discovery engine: run every enabled discovery module for a device,
 * reconcile entities, and leave a complete audit trail (poll_runs +
 * module_runs + collection_attempts). Discovery defines what polling will
 * later collect.
 */
export async function runDiscovery(deviceId: number, jobId: number | null = null): Promise<{ runId: number; status: string }> {
  const db = getDb()
  const started = Date.now()

  const devRes = await db.query('SELECT * FROM monitoring.devices WHERE id = $1', [deviceId])
  const device = devRes.rows[0] as DeviceRow | undefined
  if (!device) throw new Error(`device ${deviceId} not found`)

  const os = getOs(device.os_override || device.os)
  const modules = getDiscoveryModules()
  const enabled = await resolveEnabledModules(db, device, os, 'discovery', modules)

  // Collection plan — persisted before execution (no-silent-loss rule).
  const plan = {
    kind: 'discovery',
    device: device.hostname,
    os: os.os,
    snmp: !device.snmp_disabled,
    modules: modules.map((m) => ({
      name: m.name,
      enabled: enabled.get(m.name)?.enabled ?? false,
      source: enabled.get(m.name)?.source ?? 'default',
      skipReason: device.snmp_disabled && m.requiresSnmp ? 'device is ICMP-only' : undefined
    }))
  }

  const runRes = await db.query(
    `INSERT INTO monitoring.poll_runs (job_id, device_id, kind, poller_node, plan)
     VALUES ($1,$2,'discovery',$3,$4) RETURNING id`,
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
        attempts.record('core', 'snmp-session', 'failed', String(err?.message ?? err))
      }
    }
  }

  let anyFailed = false
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
      const modStart = Date.now()
      const before = attempts.summary()
      const ctx: ModuleContext = {
        db,
        device,
        snmp,
        os: getOs(device.os_override || device.os),
        record: attempts.recorderFor(mod.name),
        log: (msg) => console.log(`[monitoring:discovery:${mod.name}] ${device.hostname}: ${msg}`)
      }
      try {
        const result = await mod.run(ctx)
        if (result.status === 'failed') anyFailed = true
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
  const intervalSec = Number(device.discovery_interval_seconds ?? (useRuntimeConfig().monitoring as any).discoveryIntervalSeconds ?? 21600)
  await db.query(
    `UPDATE monitoring.devices SET
       last_discovered_at = now(), last_discovery_duration_ms = $2,
       next_discovery_at = now() + make_interval(secs => $3),
       status = CASE WHEN status = 'pending' THEN 'up' ELSE status END,
       updated_at = now()
     WHERE id = $1`,
    [deviceId, durationMs, intervalSec]
  )

  await recordEvent(db, {
    deviceId,
    eventType: 'discovery',
    severity: status === 'complete' ? 'info' : 'warning',
    message: `Discovery ${status}: ${sum.succeeded}/${sum.planned} items ok, ${sum.failed} failed, ${sum.unsupported} unsupported (${durationMs}ms)`
  })

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
