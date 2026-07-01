import { getDb } from '../../../utils/db'

// One sensor with its parent device (PRTG's sensor detail). Status is derived
// client-side from the high/low limits, like the sensors list. Open like the
// rest of the net/* endpoints (UX-gated client side).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query(
    `SELECT s.*, d.hostname AS device_name, d.ip AS device_ip, d.category AS device_category,
            d.status AS device_status, d.monitoring_enabled
     FROM net_sensors s
     JOIN net_devices d ON s.device_id = d.id
     WHERE s.id = $1`,
    [id]
  )
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Sensor not found' })
  return res.rows[0]
})
