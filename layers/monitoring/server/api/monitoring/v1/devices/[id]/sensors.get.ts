import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/sensors */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, sensor_class, description, sensor_group, unit, current_value, status, warn_low, warn_high, crit_low, crit_high, polled_at, stale_since FROM monitoring.sensors WHERE device_id = $1 ORDER BY sensor_class, description`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
