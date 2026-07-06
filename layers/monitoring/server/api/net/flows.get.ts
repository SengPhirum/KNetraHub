import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const res = await db.query(`
    SELECT f.*, d.hostname as device_name
    FROM net_flows f
    LEFT JOIN net_devices d ON f.device_id = d.id
    ORDER BY f.timestamp DESC
    LIMIT 100
  `)
  return res.rows
})
