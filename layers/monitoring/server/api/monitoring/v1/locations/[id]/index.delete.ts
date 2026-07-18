import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'

/**
 * DELETE /api/monitoring/v1/locations/:id — delete a location (admin).
 * Devices keep running; their location_id becomes NULL (ON DELETE SET NULL).
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.locations WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('location')
  await auditMonitoring(user.username, 'location.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
