import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/storage */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, description, storage_type, total_bytes, used_bytes, free_bytes, usage_percent, polled_at, stale_since FROM monitoring.storage WHERE device_id = $1 ORDER BY description`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
