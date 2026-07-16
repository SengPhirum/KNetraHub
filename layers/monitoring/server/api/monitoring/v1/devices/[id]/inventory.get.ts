import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/inventory */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT id, ent_physical_index, parent_index, name, descr, class, serial, model, manufacturer, hardware_rev, firmware_rev, software_rev, is_fru, stale_since FROM monitoring.inventory WHERE device_id = $1 ORDER BY ent_physical_index`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
