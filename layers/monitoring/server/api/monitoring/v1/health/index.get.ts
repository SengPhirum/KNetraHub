import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/health/inde — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT s.id, s.sensor_class, s.description, s.unit, s.current_value, s.status,
       s.warn_low, s.warn_high, s.crit_low, s.crit_high, d.id AS device_id, d.hostname
     FROM monitoring.sensors s JOIN monitoring.devices d ON d.id = s.device_id
     WHERE s.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY s.status DESC, d.hostname, s.sensor_class LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
