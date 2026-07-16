import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/events */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, created_at, entity_type, entity_id, event_type, severity, message FROM monitoring.events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
