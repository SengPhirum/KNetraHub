import type { Pool } from 'pg'
import { createHash } from 'node:crypto'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { type ReportFormat, type ReportData, renderReport } from './pamReportRenderCore'

export { toCsv, toXlsx, toPdf, renderReport, CONTENT_TYPE } from './pamReportRenderCore'
export type { ReportFormat, ReportData } from './pamReportRenderCore'

/**
 * Stage 8 — compliance reporting (spec §13). The report catalog (fixed SQL,
 * never derived from request input), a stored evidence snapshot
 * (pam.report_runs — actual bytes + integrity checksum, re-downloadable),
 * delivery, and a schedule reader that claims due schedules atomically so
 * replicas don't double-run. Rendering lives in the pure pamReportRenderCore.
 */

export interface ReportDef { title: string; sql: string }

export const REPORTS: Record<string, ReportDef> = {
  'account-inventory': {
    title: 'Privileged account inventory',
    sql: `SELECT a.name, a.username, a.address, s.name AS safe, p.name AS platform, a.account_type, a.criticality, a.rotation_status, a.last_used
            FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id LEFT JOIN pam.platforms p ON p.id=a.platform_id
           WHERE a.deleted_at IS NULL ORDER BY s.name, a.name`
  },
  'unmanaged-accounts': {
    title: 'Unmanaged accounts',
    sql: `SELECT a.name, a.username, a.address, s.name AS safe, a.account_type FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id WHERE a.deleted_at IS NULL AND a.rotation_status='unmanaged' ORDER BY a.name`
  },
  'rotation-status': {
    title: 'Rotation status',
    sql: `SELECT a.name, a.username, a.rotation_status, a.last_changed, a.next_rotation_at, a.auto_managed FROM pam.accounts a WHERE a.deleted_at IS NULL ORDER BY a.next_rotation_at NULLS LAST`
  },
  'credential-reveals': {
    title: 'Credential reveals',
    sql: `SELECT ts, actor, object_id AS account_id, reason, source_ip FROM pam.audit_events WHERE action='account.reveal' ORDER BY seq DESC LIMIT 1000`
  },
  'sessions': {
    title: 'Session history',
    sql: `SELECT started_at, ended_at, principal, target, protocol, state, recording_status, termination_reason FROM pam.sessions ORDER BY started_at DESC LIMIT 1000`
  },
  'approvals': {
    title: 'Approval history',
    sql: `SELECT r.created_at, r.requester, r.action, r.status, r.decision_reason FROM pam.access_requests r ORDER BY r.created_at DESC LIMIT 1000`
  },
  'break-glass': {
    title: 'Break-glass activity',
    sql: `SELECT g.created_at, g.grantee, a.name AS account, g.starts_at, g.expires_at, g.status FROM pam.access_grants g LEFT JOIN pam.accounts a ON a.id=g.account_id WHERE g.emergency=true ORDER BY g.created_at DESC LIMIT 1000`
  },
  'dormant-accounts': {
    title: 'Dormant accounts',
    sql: `SELECT a.name, a.username, a.last_used, s.name AS safe FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id WHERE a.deleted_at IS NULL AND (a.last_used IS NULL OR a.last_used < now()::text) ORDER BY a.last_used NULLS FIRST LIMIT 1000`
  },
  'risk-findings': {
    title: 'Risk findings',
    sql: `SELECT created_at, rule_key, severity, actor, target, status, auto_response_taken, explanation FROM pam.risk_events ORDER BY created_at DESC LIMIT 1000`
  }
}

export const PAM_REPORTS = Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title }))

/** Run a catalog report's fixed SQL. Key must be a known literal. */
export async function generateReport(key: string, db: Pool = getPamDb()): Promise<ReportData> {
  const def = REPORTS[key]
  if (!def) throw new Error(`unknown report: ${key}`)
  const { rows } = await db.query(def.sql)
  const columns = rows.length ? Object.keys(rows[0]) : []
  return { key, title: def.title, columns, rows, generatedAt: nowIso() }
}

// ── Stored runs (evidence snapshots) ────────────────────────────────────────────

export interface RunReportInput { format?: ReportFormat; scheduleId?: string | null; actor?: string }

/** Generate a report and persist it (bytes + sha256 checksum) as a report_run. */
export async function runReportToStore(key: string, input: RunReportInput = {}, db: Pool = getPamDb()): Promise<any> {
  const format = input.format ?? 'csv'
  const data = await generateReport(key, db)
  const { buffer, filename } = await renderReport(data, format)
  const checksum = createHash('sha256').update(buffer).digest('hex')
  const id = newId()
  await db.query(
    `INSERT INTO pam.report_runs (id, report_key, name, format, params, schedule_id, row_count, size_bytes, checksum, content, generated_at, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, key, data.title, format, null, input.scheduleId ?? null, data.rows.length, buffer.length, checksum, buffer, data.generatedAt, input.actor ?? 'system']
  )
  await appendAudit({ actor: input.actor ?? 'system', action: 'report.generate', objectType: 'report_run', objectId: id,
    result: 'success', severity: 'info', reason: `${key} (${format}, ${data.rows.length} rows, sha256=${checksum.slice(0, 12)}…)` }, db).catch(() => {})
  return { id, reportKey: key, name: data.title, format, filename, rowCount: data.rows.length, sizeBytes: buffer.length, checksum, generatedAt: data.generatedAt }
}

export async function getRunContent(id: string, db: Pool = getPamDb()): Promise<{ filename: string; format: ReportFormat; content: Buffer; checksum: string } | null> {
  const r = (await db.query('SELECT report_key, format, content, checksum, generated_at FROM pam.report_runs WHERE id=$1', [id])).rows[0]
  if (!r || !r.content) return null
  const stamp = String(r.generated_at).replace(/[:.]/g, '-')
  return { filename: `${r.report_key}_${stamp}.${r.format}`, format: r.format, content: Buffer.from(r.content), checksum: r.checksum }
}

export async function listRuns(reportKey: string | null, limit: number, db: Pool = getPamDb()): Promise<any[]> {
  const cols = 'id, report_key, name, format, row_count, size_bytes, checksum, generated_at, generated_by, delivered, delivery_channel, delivery_status'
  const { rows } = reportKey
    ? await db.query(`SELECT ${cols} FROM pam.report_runs WHERE report_key=$1 ORDER BY generated_at DESC LIMIT $2`, [reportKey, limit])
    : await db.query(`SELECT ${cols} FROM pam.report_runs ORDER BY generated_at DESC LIMIT $1`, [limit])
  return rows
}

/**
 * Deliver a stored run. The in-portal notification channel is real (a link to
 * re-download the evidence). Email/webhook require external transport and are
 * marked EXTERNALLY CONSTRAINED (skipped, not silently "delivered").
 */
export async function deliverReport(runId: string, channel: string | null, db: Pool = getPamDb()): Promise<{ delivered: boolean; status: string; detail?: string }> {
  const run = (await db.query('SELECT report_key, name, format, row_count, checksum FROM pam.report_runs WHERE id=$1', [runId])).rows[0]
  if (!run) return { delivered: false, status: 'not_found' }
  const ch = channel || 'notification'
  if (ch === 'notification' || ch === 'portal') {
    await pamNotify({ severity: 'info', event: 'report.delivered', title: `Report ready: ${run.name}`,
      body: `${run.report_key} (${run.format}, ${run.row_count} rows) is available to download.`, objectType: 'report_run', objectId: runId, link: '/pam/reports' }, db)
    await db.query("UPDATE pam.report_runs SET delivered=true, delivery_channel=$2, delivery_status='delivered' WHERE id=$1", [runId, ch])
    return { delivered: true, status: 'delivered' }
  }
  const detail = `channel "${ch}" requires external transport (SMTP/webhook) not configured in this deployment`
  await db.query("UPDATE pam.report_runs SET delivery_channel=$2, delivery_status='skipped', delivery_detail=$3 WHERE id=$1", [runId, ch, detail])
  return { delivered: false, status: 'skipped', detail }
}

// ── Schedules ───────────────────────────────────────────────────────────────────

export interface CreateScheduleInput { reportKey: string; format?: ReportFormat; intervalSeconds?: number; channel?: string | null; firstRunAt?: string | null; actor: string }

export async function createSchedule(input: CreateScheduleInput, db: Pool = getPamDb()): Promise<string> {
  if (!REPORTS[input.reportKey]) throw new Error(`unknown report: ${input.reportKey}`)
  const id = newId()
  const interval = input.intervalSeconds && input.intervalSeconds > 0 ? Math.floor(input.intervalSeconds) : 604800
  const next = input.firstRunAt ?? new Date(Date.now() + interval * 1000).toISOString()
  await db.query(
    `INSERT INTO pam.report_schedules (id, report_key, interval_seconds, channel, format, enabled, next_run_at, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)`,
    [id, input.reportKey, interval, input.channel ?? 'notification', input.format ?? 'csv', next, nowIso(), input.actor]
  )
  return id
}

export async function listSchedules(db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.report_schedules ORDER BY created_at DESC')).rows
}

export async function updateSchedule(id: string, patch: { enabled?: boolean; intervalSeconds?: number; channel?: string | null; format?: ReportFormat }, db: Pool = getPamDb()): Promise<void> {
  const sets: string[] = []; const params: any[] = [id]
  if (patch.enabled !== undefined) { params.push(patch.enabled); sets.push(`enabled=$${params.length}`) }
  if (patch.intervalSeconds !== undefined) { params.push(Math.max(60, Math.floor(patch.intervalSeconds))); sets.push(`interval_seconds=$${params.length}`) }
  if (patch.channel !== undefined) { params.push(patch.channel); sets.push(`channel=$${params.length}`) }
  if (patch.format !== undefined) { params.push(patch.format); sets.push(`format=$${params.length}`) }
  if (!sets.length) return
  await db.query(`UPDATE pam.report_schedules SET ${sets.join(', ')} WHERE id=$1`, params)
}

export async function deleteSchedule(id: string, db: Pool = getPamDb()): Promise<void> {
  await db.query('DELETE FROM pam.report_schedules WHERE id=$1', [id])
}

/**
 * Run every due schedule. Each schedule is CLAIMED atomically (advance
 * next_run_at in the same UPDATE that selects it) so concurrent replicas never
 * double-generate. Returns the number of runs produced.
 */
export async function runDueReportSchedules(db: Pool = getPamDb()): Promise<number> {
  const now = nowIso()
  const due = (await db.query('SELECT * FROM pam.report_schedules WHERE enabled=true AND (next_run_at IS NULL OR next_run_at <= $1)', [now])).rows
  let ran = 0
  for (const s of due) {
    const nextRun = new Date(Date.now() + (Number(s.interval_seconds) || 604800) * 1000).toISOString()
    const claim = await db.query(
      'UPDATE pam.report_schedules SET next_run_at=$2 WHERE id=$1 AND (next_run_at IS NULL OR next_run_at <= $3) RETURNING id',
      [s.id, nextRun, now])
    if (!claim.rowCount) continue
    try {
      const run = await runReportToStore(s.report_key, { format: s.format, scheduleId: s.id, actor: 'scheduler' }, db)
      await deliverReport(run.id, s.channel, db)
      ran++
    } catch (err: any) {
      console.error(`[pam:reports] scheduled run failed for ${s.report_key}`, err?.message)
    }
  }
  return ran
}
