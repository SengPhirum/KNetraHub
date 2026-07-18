import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'

/** DELETE /api/monitoring/v1/maintenance/:id — remove a window (operator tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.maintenance_windows WHERE id = $1 RETURNING title`, [id])
  if (!res.rowCount) notFound('maintenance window')
  await auditMonitoring(user.username, 'maintenance.delete', String(id), `title=${res.rows[0].title}`)
  return { id, deleted: true }
})
