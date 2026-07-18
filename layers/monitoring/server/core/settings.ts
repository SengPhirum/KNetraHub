import type { Pool } from 'pg'

/**
 * DB-backed runtime settings (monitoring.settings KV) with env-var fallback.
 * Values set from the Settings UI override NUXT_MONITORING_* defaults without
 * a restart; engines read through the 30s cache so per-poll overhead is nil.
 */

export interface SettingDef {
  key: string
  /** runtimeConfig.monitoring property used as the fallback default. */
  rcKey: string
  fallback: number
  min: number
  max: number
  label: string
  description: string
  unit: 's' | 'ms' | 'days' | 'count'
}

export const SETTING_DEFS: SettingDef[] = [
  { key: 'poll_interval_seconds', rcKey: 'pollIntervalSeconds', fallback: 300, min: 30, max: 86400, label: 'Poll interval', description: 'Default seconds between polls (per-device override wins)', unit: 's' },
  { key: 'discovery_interval_seconds', rcKey: 'discoveryIntervalSeconds', fallback: 21600, min: 300, max: 604800, label: 'Rediscovery interval', description: 'Default seconds between full rediscoveries', unit: 's' },
  { key: 'down_retry_seconds', rcKey: 'downRetrySeconds', fallback: 60, min: 10, max: 3600, label: 'Down retry', description: 'Fast re-ping cadence for devices currently down', unit: 's' },
  { key: 'snmp_timeout_ms', rcKey: 'snmpTimeoutMs', fallback: 3000, min: 100, max: 60000, label: 'SNMP timeout', description: 'Per-request SNMP timeout', unit: 'ms' },
  { key: 'snmp_retries', rcKey: 'snmpRetries', fallback: 2, min: 0, max: 10, label: 'SNMP retries', description: 'Retries per SNMP request', unit: 'count' },
  { key: 'metric_retention_days', rcKey: 'metricRetentionDays', fallback: 30, min: 1, max: 3650, label: 'Metric retention', description: 'Days of port/sensor/generic metric history kept', unit: 'days' },
  { key: 'event_retention_days', rcKey: 'eventRetentionDays', fallback: 90, min: 1, max: 3650, label: 'Event retention', description: 'Days of event log kept', unit: 'days' },
  { key: 'syslog_retention_days', rcKey: 'syslogRetentionDays', fallback: 30, min: 1, max: 3650, label: 'Syslog retention', description: 'Days of syslog kept', unit: 'days' },
  { key: 'trap_retention_days', rcKey: 'trapRetentionDays', fallback: 30, min: 1, max: 3650, label: 'Trap retention', description: 'Days of SNMP traps kept', unit: 'days' },
  { key: 'job_run_retention_days', rcKey: 'jobRunRetentionDays', fallback: 7, min: 1, max: 365, label: 'Run history retention', description: 'Days of poll-run / collection-attempt audit kept', unit: 'days' }
]

let cache: { at: number; values: Map<string, number> } | null = null
const CACHE_TTL_MS = 30_000

async function loadOverrides(db: Pool): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values
  const values = new Map<string, number>()
  try {
    const res = await db.query(`SELECT key, value FROM monitoring.settings`)
    for (const row of res.rows) {
      const n = Number(row.value)
      if (Number.isFinite(n)) values.set(row.key, n)
    }
  } catch {
    /* table missing during early boot — fall back to env defaults */
  }
  cache = { at: Date.now(), values }
  return values
}

export function invalidateSettingsCache(): void {
  cache = null
}

/** Effective numeric setting: DB override → env (runtimeConfig) → built-in default. */
export async function getSettingNumber(db: Pool, key: string): Promise<number> {
  const def = SETTING_DEFS.find((d) => d.key === key)
  if (!def) throw new Error(`unknown monitoring setting ${key}`)
  const overrides = await loadOverrides(db)
  if (overrides.has(key)) return clamp(overrides.get(key)!, def)
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  const fromEnv = Number(rc[def.rcKey])
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : def.fallback
}

/** All effective settings with provenance, for the Settings API/UI. */
export async function getEffectiveSettings(db: Pool): Promise<Array<SettingDef & { value: number; source: 'db' | 'env' | 'default' }>> {
  const overrides = await loadOverrides(db)
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  return SETTING_DEFS.map((def) => {
    if (overrides.has(def.key)) return { ...def, value: clamp(overrides.get(def.key)!, def), source: 'db' as const }
    const fromEnv = Number(rc[def.rcKey])
    if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv !== def.fallback) return { ...def, value: fromEnv, source: 'env' as const }
    return { ...def, value: def.fallback, source: 'default' as const }
  })
}

function clamp(value: number, def: SettingDef): number {
  return Math.min(def.max, Math.max(def.min, value))
}
