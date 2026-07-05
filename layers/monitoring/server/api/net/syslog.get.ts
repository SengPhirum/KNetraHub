import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const res = await db.query(`
    SELECT s.*, d.hostname as device_name
    FROM net_syslog s
    LEFT JOIN net_devices d ON s.device_id = d.id
    ORDER BY s.timestamp DESC
    LIMIT 100
  `)
  return res.rows
})
