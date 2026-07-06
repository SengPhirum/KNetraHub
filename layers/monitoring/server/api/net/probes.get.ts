import { getDb } from '~~/server/utils/db'

// Probes (local + remote/distributed collectors) with the device/sensor load
// each one carries. Used by the Probes page and the distributed monitoring map.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query(`
    SELECT
      p.*,
      COUNT(d.id)::int AS device_count,
      COUNT(d.id) FILTER (WHERE d.status = 'up')::int   AS devices_up,
      COUNT(d.id) FILTER (WHERE d.status = 'down')::int AS devices_down,
      COALESCE(SUM(sc.sensor_count), 0)::int AS sensor_count
    FROM net_probes p
    LEFT JOIN net_devices d ON d.probe_id = p.id
    LEFT JOIN (
      SELECT device_id, COUNT(*) AS sensor_count FROM net_sensors GROUP BY device_id
    ) sc ON sc.device_id = d.id
    GROUP BY p.id
    ORDER BY (p.type = 'local') DESC, p.name ASC
  `)
  return res.rows
})
