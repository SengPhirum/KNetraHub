import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../utils/monApi'

/** DELETE /api/monitoring/v1/devices/:id — remove a device and all its data. */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  await requireDeleteConfirm(event, 'monitoring.device')
  const db = await monDb()
  const id = idParam(event)

  const res = await db.query(`DELETE FROM monitoring.devices WHERE id = $1 RETURNING hostname`, [id])
  if (!res.rows.length) notFound('device')
  await auditMonitoring(user.username, 'device.delete', String(id), `hostname=${res.rows[0].hostname}`)
  return { id, deleted: true }
})
