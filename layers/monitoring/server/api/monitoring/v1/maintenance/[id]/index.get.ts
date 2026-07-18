import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/maintenance/:id — window with resolved targets. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)

  const w = await db.query(`SELECT * FROM monitoring.maintenance_windows WHERE id = $1`, [id])
  if (!w.rows.length) notFound('maintenance window')

  const targets = await db.query(
    `SELECT t.device_id, t.group_id, t.location_id,
            d.hostname AS device_hostname, g.name AS group_name, l.name AS location_name
     FROM monitoring.maintenance_targets t
     LEFT JOIN monitoring.devices d ON d.id = t.device_id
     LEFT JOIN monitoring.device_groups g ON g.id = t.group_id
     LEFT JOIN monitoring.locations l ON l.id = t.location_id
     WHERE t.window_id = $1`,
    [id]
  )
  return { window: w.rows[0], targets: targets.rows }
})
