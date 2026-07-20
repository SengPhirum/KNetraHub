import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../../utils/monApi'

/**
 * DELETE /api/monitoring/v1/alerts/rules/:id — delete a rule (admin).
 * Open incidents from this rule are cascade-deleted with their history.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  await requireDeleteConfirm(event, 'monitoring.alert-rule')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.alert_rules WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('alert rule')
  await auditMonitoring(user.username, 'rule.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
