import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/logs/alert — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT al.id, al.at, al.from_state, al.to_state, al.actor, al.note, a.device_id, d.hostname, r.name AS rule_name
     FROM monitoring.alert_log al JOIN monitoring.alerts a ON a.id = al.alert_id
     JOIN monitoring.alert_rules r ON r.id = a.rule_id LEFT JOIN monitoring.devices d ON d.id = a.device_id`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY al.at DESC LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
