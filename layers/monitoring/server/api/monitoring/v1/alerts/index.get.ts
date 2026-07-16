import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/alerts — active/all alerts (filter ?state=). */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const query = getQuery(event)

  const where: string[] = []
  const args: unknown[] = []
  if (query.state) {
    args.push(String(query.state))
    where.push(`a.state = $${args.length}`)
  } else {
    where.push(`a.state IN ('open','acknowledged','suppressed')`)
  }
  if (query.severity) {
    args.push(String(query.severity))
    where.push(`a.severity = $${args.length}`)
  }
  if (query.device_id) {
    args.push(Number(query.device_id))
    where.push(`a.device_id = $${args.length}`)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`

  const totalRes = await db.query(`SELECT count(*)::int AS c FROM monitoring.alerts a ${whereSql}`, args)
  const rows = await db.query(
    `SELECT a.id, a.state, a.severity, a.entity_type, a.entity_id, a.opened_at, a.last_seen_at,
            a.acked_at, a.acked_by, a.ack_note, a.recovered_at, a.suppressed_reason,
            a.notifications_sent, a.faulting,
            a.device_id, d.hostname, d.display_name, r.id AS rule_id, r.name AS rule_name
     FROM monitoring.alerts a
     JOIN monitoring.alert_rules r ON r.id = a.rule_id
     LEFT JOIN monitoring.devices d ON d.id = a.device_id
     ${whereSql}
     ORDER BY (a.severity = 'critical') DESC, a.opened_at DESC
     LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
