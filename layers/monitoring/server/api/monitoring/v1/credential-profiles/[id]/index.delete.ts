import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../utils/monApi'

/**
 * DELETE /api/monitoring/v1/credential-profiles/:id (admin tier). Devices
 * and scans that reference it fall back to per-device settings / the next
 * enabled profile (ON DELETE SET NULL on both FKs) — never blocked.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)

  const res = await db.query(`DELETE FROM monitoring.credential_profiles WHERE id = $1 RETURNING name`, [id])
  if (!res.rows.length) notFound('credential profile')
  await auditMonitoring(user.username, 'credential_profile.delete', String(id), `name=${res.rows[0].name}`)
  return { id, deleted: true }
})
