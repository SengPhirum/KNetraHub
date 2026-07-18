import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'

/** DELETE /api/monitoring/v1/bills/:id — delete a bill and its history (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.bills WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('bill')
  await auditMonitoring(user.username, 'bill.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
