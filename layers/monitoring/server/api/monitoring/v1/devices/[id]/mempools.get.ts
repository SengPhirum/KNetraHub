import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/mempools */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, description, total_bytes, used_bytes, free_bytes, usage_percent, is_swap, polled_at, stale_since FROM monitoring.mempools WHERE device_id = $1 ORDER BY is_swap, description`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
