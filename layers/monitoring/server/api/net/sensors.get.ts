import { getDb } from '~~/server/utils/db'

// All hardware/monitoring sensors across every device (PRTG's core "sensor"
// object). Status is derived client-side from the high/low limits so the list
// can show OK / Warning / Down without storing a redundant column.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query(`
    SELECT s.*, d.hostname AS device_name, d.ip AS device_ip, d.category AS device_category,
           d.status AS device_status, d.monitoring_enabled
    FROM net_sensors s
    JOIN net_devices d ON s.device_id = d.id
    ORDER BY d.hostname ASC, s.name ASC
  `)
  return res.rows
})
