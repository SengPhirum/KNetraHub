import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring, badRequest } from '../../../../../utils/monApi'
import { normalizeDeviceInput } from '../../../../../utils/deviceInput'

/** PUT /api/monitoring/v1/devices/:id — update device config (admin tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const exists = await db.query(`SELECT id FROM monitoring.devices WHERE id = $1`, [id])
  if (!exists.rows.length) notFound('device')

  const values = normalizeDeviceInput(body, false)
  if (!Object.keys(values).length) badRequest('no updatable fields provided')

  const cols = Object.keys(values)
  const sets = cols.map((c, i) => `${c} = $${i + 2}`)
  await db.query(
    `UPDATE monitoring.devices SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
    [id, ...Object.values(values)]
  )
  // Disabling parks the device; re-enabling schedules an immediate poll+discovery.
  if (values.disabled === true) {
    await db.query(
      `UPDATE monitoring.devices SET status = 'disabled', status_reason = 'disabled by operator' WHERE id = $1`,
      [id]
    )
  } else if (values.disabled === false) {
    await db.query(
      `UPDATE monitoring.devices SET status = 'pending', status_reason = NULL,
         next_poll_at = now(), next_discovery_at = now() WHERE id = $1 AND status = 'disabled'`,
      [id]
    )
  }
  await auditMonitoring(user.username, 'device.update', String(id), `fields=${cols.join(',')}`)
  return { id, updated: cols }
})
