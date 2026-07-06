import { getDb } from '~~/server/utils/db'

// Sensor list snapshot for the Sensors page's Export button. Export-only:
// sensors are derived from device polling (ping/interface data), not manually
// configured, so there's no matching import - see sensors/index.vue.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query(`
    SELECT s.name, s.sensor_type, s.current_value, s.unit, s.limit_low, s.limit_high,
           d.hostname AS device_name, d.ip AS device_ip
    FROM net_sensors s
    JOIN net_devices d ON s.device_id = d.id
    ORDER BY d.hostname ASC, s.name ASC
  `)
  return res.rows
})
