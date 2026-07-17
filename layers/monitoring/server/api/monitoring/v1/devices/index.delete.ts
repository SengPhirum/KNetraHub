import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, badRequest, auditMonitoring } from '../../../../utils/monApi'

/** DELETE /api/monitoring/v1/devices — bulk-remove devices (admin tier). Body: { ids: number[] }. */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length) badRequest('ids (non-empty array) is required')

  const res = await db.query(`DELETE FROM monitoring.devices WHERE id = ANY($1::bigint[]) RETURNING id, hostname`, [ids])
  await auditMonitoring(user.username, 'device.bulk_delete', String(res.rows.length), `ids=${res.rows.map((r: any) => r.id).join(',')}`)
  return { deleted: res.rows.length }
})
