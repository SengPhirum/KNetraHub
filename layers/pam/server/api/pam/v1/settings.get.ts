import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** All PAM settings as a key→value map (pam.settings permission). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.settings')
  const { rows } = await getPamDb().query('SELECT key, value, updated_at, updated_by FROM pam.settings ORDER BY key')
  const settings: Record<string, unknown> = {}
  for (const r of rows) { try { settings[r.key] = JSON.parse(r.value) } catch { settings[r.key] = r.value } }
  return { settings, meta: rows.map((r) => ({ key: r.key, updated_at: r.updated_at, updated_by: r.updated_by })) }
})
