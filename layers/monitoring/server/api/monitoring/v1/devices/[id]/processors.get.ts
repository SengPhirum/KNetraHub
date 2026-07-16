import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/processors */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, description, proc_index, usage_percent, polled_at, stale_since FROM monitoring.processors WHERE device_id = $1 ORDER BY proc_index`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
