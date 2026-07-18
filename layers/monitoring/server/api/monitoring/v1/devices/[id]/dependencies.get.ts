import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/dependencies — parents + children. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)

  const exists = await db.query(`SELECT id FROM monitoring.devices WHERE id = $1`, [id])
  if (!exists.rows.length) notFound('device')

  const parents = await db.query(
    `SELECT d.id, d.hostname, d.display_name, d.status
     FROM monitoring.device_dependencies dep JOIN monitoring.devices d ON d.id = dep.parent_device_id
     WHERE dep.device_id = $1 ORDER BY d.hostname`,
    [id]
  )
  const children = await db.query(
    `SELECT d.id, d.hostname, d.display_name, d.status
     FROM monitoring.device_dependencies dep JOIN monitoring.devices d ON d.id = dep.device_id
     WHERE dep.parent_device_id = $1 ORDER BY d.hostname`,
    [id]
  )
  return { parents: parents.rows, children: children.rows }
})
