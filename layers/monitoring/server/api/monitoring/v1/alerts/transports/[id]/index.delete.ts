import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../../utils/monApi'

/** DELETE /api/monitoring/v1/alerts/transports/:id — delete a transport (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.alert_transports WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('alert transport')
  await auditMonitoring(user.username, 'transport.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
