import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, notFound } from '../../../../../utils/monApi'

/**
 * PUT /api/monitoring/v1/devices/:id/dependencies — replace this device's
 * parent set (admin). Body: { parent_ids: number[] }. When every parent of a
 * device is down, alert evaluation suppresses the child's alerts.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const exists = await db.query(`SELECT id FROM monitoring.devices WHERE id = $1`, [id])
  if (!exists.rows.length) notFound('device')

  const parentIds: number[] = Array.isArray(body?.parent_ids)
    ? [...new Set(body.parent_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))]
    : []
  if (parentIds.includes(id)) badRequest('a device cannot depend on itself')

  // Reject a parent chain that loops back to this device.
  for (const pid of parentIds) {
    const cycle = await db.query(
      `WITH RECURSIVE up AS (
         SELECT parent_device_id FROM monitoring.device_dependencies WHERE device_id = $1
         UNION
         SELECT dd.parent_device_id FROM monitoring.device_dependencies dd JOIN up ON dd.device_id = up.parent_device_id
       ) SELECT 1 FROM up WHERE parent_device_id = $2 LIMIT 1`,
      [pid, id]
    )
    if (cycle.rows.length) badRequest('dependency would create a cycle')
  }

  await db.query(`DELETE FROM monitoring.device_dependencies WHERE device_id = $1`, [id])
  for (const pid of parentIds) {
    await db.query(
      `INSERT INTO monitoring.device_dependencies (device_id, parent_device_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, pid]
    )
  }
  await auditMonitoring(user.username, 'device.dependencies', String(id), `parents=${parentIds.join(',') || 'none'}`)
  return { id, parent_ids: parentIds }
})
