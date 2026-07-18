import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../../utils/monApi'

/**
 * DELETE /api/monitoring/v1/alerts/templates/:id — delete a template (admin).
 * Rules referencing it fall back to the built-in default (template_id SET NULL).
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(`DELETE FROM monitoring.alert_templates WHERE id = $1 RETURNING name`, [id])
  if (!res.rowCount) notFound('alert template')
  await auditMonitoring(user.username, 'template.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
