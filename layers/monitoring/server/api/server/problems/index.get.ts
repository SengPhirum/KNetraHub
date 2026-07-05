import { getDb } from '~~/server/utils/db'

// Problems/events with host + severity. Open problems first, then recent
// resolved. `name` falls back to the legacy `trigger` text column.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT p.*, COALESCE(p.name, p.trigger) AS name, h.name AS host
    FROM server_problems p
    LEFT JOIN server_hosts h ON p.host_id = h.id
    ORDER BY (p.status = 'problem') DESC, p.severity_num DESC, p.fired_at DESC
    LIMIT 500
  `)
  return rows
})
