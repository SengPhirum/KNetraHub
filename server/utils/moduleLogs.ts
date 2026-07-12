import { nanoid } from 'nanoid'
import { getDb } from './db'
import { getAppSetting, setAppSetting } from './store'

/**
 * Per-module activity + system logging.
 *
 * - activity_log: every authenticated state-changing API call, tagged with the
 *   module whose UI triggered it (docker / monitoring / ipmgt / portal), so
 *   each sub-app's admin settings can show its own audit trail of who did what.
 *   Captured centrally by server/plugins/moduleLogs.ts - individual endpoint
 *   handlers don't need to opt in.
 * - system_log: runtime events the system generated on its own (login
 *   failures, auto-redeploys, housekeeping runs), stored separately from user
 *   activity by design.
 *
 * Retention for both is configurable by the portal (global) admin - see
 * LogHousekeeping below; runLogHousekeeping() enforces it daily.
 */

export type LogModule = 'docker' | 'monitoring' | 'ipmgt' | 'portal'
export const LOG_MODULES: LogModule[] = ['docker', 'monitoring', 'ipmgt', 'portal']

export interface ActivityEntry {
  id: string
  ts: string
  module: LogModule
  actor: string
  role?: string
  method: string
  path: string
  action: string
  target?: string
  status?: number
  ip?: string
  detail?: string
}

export interface SystemEntry {
  id: string
  ts: string
  module: LogModule
  level: 'debug' | 'info' | 'warning' | 'error'
  event: string
  detail?: string
}

export interface ModuleDebugConfig {
  module: LogModule
  enabled: boolean
}

const DEBUG_CACHE_TTL_MS = 30_000
const debugCache = new Map<LogModule, { enabled: boolean; expiresAt: number }>()

export async function getModuleDebug(module: LogModule): Promise<ModuleDebugConfig> {
  const cached = debugCache.get(module)
  if (cached && cached.expiresAt > Date.now()) return { module, enabled: cached.enabled }

  const raw = await getAppSetting(`logs.debug.${module}`)
  const enabled = raw === 'true'
  debugCache.set(module, { enabled, expiresAt: Date.now() + DEBUG_CACHE_TTL_MS })
  return { module, enabled }
}

export async function setModuleDebug(module: LogModule, enabled: boolean, actor: string): Promise<ModuleDebugConfig> {
  await setAppSetting(`logs.debug.${module}`, String(enabled), actor)
  debugCache.set(module, { enabled, expiresAt: Date.now() + DEBUG_CACHE_TTL_MS })
  return { module, enabled }
}

// Route-prefix → module. Everything not matched belongs to the portal itself.
const MODULE_PREFIXES: [string, LogModule][] = [
  ['/api/ipmgt', 'ipmgt'],
  ['/api/net', 'monitoring'],
  ['/api/server', 'monitoring'],
  ['/api/stacks', 'docker'],
  ['/api/services', 'docker'],
  ['/api/nodes', 'docker'],
  ['/api/containers', 'docker'],
  ['/api/networks', 'docker'],
  ['/api/volumes', 'docker'],
  ['/api/configs', 'docker'],
  ['/api/secrets', 'docker'],
  ['/api/tasks', 'docker'],
  ['/api/registries', 'docker'],
  ['/api/gitlab', 'docker'],
  ['/api/agent', 'docker'],
  ['/api/alerts', 'docker']
]

export function moduleForPath(path: string): LogModule {
  for (const [prefix, module] of MODULE_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return module
  }
  return 'portal'
}

/** "POST /api/stacks" -> "stacks: create", "DELETE /api/services/abc" ->
 *  "services: delete abc" - readable without losing the raw method/path. */
export function describeAction(method: string, path: string): { action: string; target?: string } {
  const segments = path.replace(/^\/api\//, '').split('/').filter(Boolean)
  const verbs: Record<string, string> = { POST: 'create/run', PUT: 'update', PATCH: 'update', DELETE: 'delete' }
  const verb = verbs[method] || method.toLowerCase()
  if (!segments.length) return { action: verb }
  // Last segment is either an id (target) or a sub-action name (scale, rollback…)
  const [resource, ...rest] = segments
  const last = rest[rest.length - 1]
  const looksLikeAction = last && /^[a-z-]+$/.test(last) && rest.length > 1
  if (looksLikeAction) return { action: `${resource}: ${last}`, target: rest[rest.length - 2] }
  return { action: `${resource}: ${verb}`, target: rest.length ? rest.join('/') : undefined }
}

export async function logActivity(entry: Omit<ActivityEntry, 'id' | 'ts'>): Promise<void> {
  await getDb().query(
    `INSERT INTO activity_log (id, ts, module, actor, role, method, path, action, target, status, ip, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [nanoid(), new Date().toISOString(), entry.module, entry.actor, entry.role ?? null, entry.method,
      entry.path, entry.action, entry.target ?? null, entry.status ?? null, entry.ip ?? null, entry.detail ?? null]
  )
}

export async function logSystem(module: LogModule, level: SystemEntry['level'], event: string, detail?: string): Promise<void> {
  try {
    if (level === 'debug' && !(await getModuleDebug(module)).enabled) return
    await getDb().query(
      'INSERT INTO system_log (id, ts, module, level, event, detail) VALUES ($1, $2, $3, $4, $5, $6)',
      [nanoid(), new Date().toISOString(), module, level, event, detail ?? null]
    )
  } catch (err) {
    // System logging must never break the operation it observes.
    console.error('[moduleLogs] system log write failed', err)
  }
}

export async function listActivity(opts: { module?: LogModule; limit?: number } = {}): Promise<ActivityEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000)
  const { rows } = opts.module
    ? await getDb().query('SELECT * FROM activity_log WHERE module = $1 ORDER BY ts DESC LIMIT $2', [opts.module, limit])
    : await getDb().query('SELECT * FROM activity_log ORDER BY ts DESC LIMIT $1', [limit])
  return rows.map((r: any) => ({
    id: r.id, ts: r.ts, module: r.module, actor: r.actor, role: r.role ?? undefined,
    method: r.method, path: r.path, action: r.action, target: r.target ?? undefined,
    status: r.status ?? undefined, ip: r.ip ?? undefined, detail: r.detail ?? undefined
  }))
}

export async function listSystem(opts: { module?: LogModule; limit?: number; includeDebug?: boolean } = {}): Promise<SystemEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000)
  const conditions: string[] = []
  const values: any[] = []
  if (opts.module) {
    values.push(opts.module)
    conditions.push(`module = $${values.length}`)
  }
  if (!opts.includeDebug) conditions.push(`level <> 'debug'`)
  values.push(limit)
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await getDb().query(`SELECT * FROM system_log${where} ORDER BY ts DESC LIMIT $${values.length}`, values)
  return rows.map((r: any) => ({ id: r.id, ts: r.ts, module: r.module, level: r.level, event: r.event, detail: r.detail ?? undefined }))
}

// ─── housekeeping ─────────────────────────────────────────────────────────────

export interface LogHousekeeping {
  /** Days of user activity to keep (0 = keep forever). */
  activityRetentionDays: number
  /** Hard row cap for activity_log, applied after the day-based trim. */
  activityMaxRows: number
  /** Days of system events to keep (0 = keep forever). */
  systemRetentionDays: number
  systemMaxRows: number
}

export const DEFAULT_LOG_HOUSEKEEPING: LogHousekeeping = {
  activityRetentionDays: 90,
  activityMaxRows: 100_000,
  systemRetentionDays: 30,
  systemMaxRows: 50_000
}

const HOUSEKEEPING_KEY = 'logs.housekeeping'

export async function getLogHousekeeping(): Promise<LogHousekeeping> {
  const raw = await getAppSetting(HOUSEKEEPING_KEY)
  if (!raw) return { ...DEFAULT_LOG_HOUSEKEEPING }
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_LOG_HOUSEKEEPING, ...parsed }
  } catch {
    return { ...DEFAULT_LOG_HOUSEKEEPING }
  }
}

export async function setLogHousekeeping(config: LogHousekeeping, actor: string): Promise<LogHousekeeping> {
  const clean: LogHousekeeping = {
    activityRetentionDays: clampInt(config.activityRetentionDays, 0, 3650),
    activityMaxRows: clampInt(config.activityMaxRows, 1000, 10_000_000),
    systemRetentionDays: clampInt(config.systemRetentionDays, 0, 3650),
    systemMaxRows: clampInt(config.systemMaxRows, 1000, 10_000_000)
  }
  await setAppSetting(HOUSEKEEPING_KEY, JSON.stringify(clean), actor)
  return clean
}

function clampInt(v: any, min: number, max: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export async function runLogHousekeeping(): Promise<{ activityRemoved: number; systemRemoved: number }> {
  const cfg = await getLogHousekeeping()
  const db = getDb()
  let activityRemoved = 0
  let systemRemoved = 0

  const trim = async (table: 'activity_log' | 'system_log', days: number, maxRows: number) => {
    let removed = 0
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
      const res = await db.query(`DELETE FROM ${table} WHERE ts < $1`, [cutoff])
      removed += res.rowCount || 0
    }
    const res2 = await db.query(
      `DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM ${table} ORDER BY ts DESC LIMIT $1)`,
      [maxRows]
    )
    removed += res2.rowCount || 0
    return removed
  }

  activityRemoved = await trim('activity_log', cfg.activityRetentionDays, cfg.activityMaxRows)
  systemRemoved = await trim('system_log', cfg.systemRetentionDays, cfg.systemMaxRows)

  if (activityRemoved || systemRemoved) {
    await logSystem('portal', 'info', 'log-housekeeping', `Trimmed ${activityRemoved} activity and ${systemRemoved} system entries`)
  }
  return { activityRemoved, systemRemoved }
}
