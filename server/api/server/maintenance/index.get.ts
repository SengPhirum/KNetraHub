import { getDb } from '../../../utils/db'

// Maintenance windows, newest first, with a computed `active` flag.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM server_maintenance ORDER BY active_till DESC')
  const now = Date.now()
  return rows.map((m) => ({
    ...m,
    host_ids: safeArr(m.host_ids),
    group_ids: safeArr(m.group_ids),
    active: Date.parse(m.active_since) <= now && Date.parse(m.active_till) >= now
  }))
})

function safeArr(v: any): string[] {
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] }
}
