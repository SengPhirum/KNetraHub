import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'

/** DELETE /api/monitoring/v1/services/:id — delete a service check (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.services WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('service')
  await auditMonitoring(user.username, 'service.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
