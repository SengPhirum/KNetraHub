import { getDb } from '~~/server/utils/db'

// Web scenarios with their (optional) host name + last check result.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT w.*, h.name AS host_name
    FROM server_web_scenarios w LEFT JOIN server_hosts h ON h.id = w.host_id
    ORDER BY w.name ASC
  `)
  return rows
})
