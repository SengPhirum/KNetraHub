import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/device-groups/:id — group with members. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)

  const g = await db.query(`SELECT * FROM monitoring.device_groups WHERE id = $1`, [id])
  if (!g.rows.length) notFound('device group')

  const members = await db.query(
    `SELECT d.id, d.hostname, d.display_name, d.status, d.os, m.dynamic
     FROM monitoring.device_group_members m JOIN monitoring.devices d ON d.id = m.device_id
     WHERE m.group_id = $1 ORDER BY d.hostname`,
    [id]
  )
  return { group: g.rows[0], members: members.rows }
})
