import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { SETTING_DEFS, invalidateSettingsCache } from '../../../../core/settings'

/**
 * PUT /api/monitoring/v1/settings — set/clear runtime setting overrides (admin).
 * Body: { values: { key: number | null } } — null reverts a key to its
 * env/default value. Takes effect within ~30s (settings cache TTL), no restart.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const values = body?.values
  if (!values || typeof values !== 'object') badRequest('values object is required')

  const applied: string[] = []
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const def = SETTING_DEFS.find((d) => d.key === key)
    if (!def) badRequest(`unknown setting "${key}"`)
    if (raw == null || raw === '') {
      await db.query(`DELETE FROM monitoring.settings WHERE key = $1`, [key])
      applied.push(`${key}=default`)
      continue
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) badRequest(`${key} must be a number`)
    if (n < def.min || n > def.max) badRequest(`${key} must be between ${def.min} and ${def.max}`)
    await db.query(
      `INSERT INTO monitoring.settings (key, value, updated_at) VALUES ($1, to_jsonb($2::numeric), now())
       ON CONFLICT (key) DO UPDATE SET value = to_jsonb($2::numeric), updated_at = now()`,
      [key, n]
    )
    applied.push(`${key}=${n}`)
  }
  invalidateSettingsCache()
  await auditMonitoring(user.username, 'settings.update', 'runtime', applied.join(' '))
  return { updated: applied.length }
})
