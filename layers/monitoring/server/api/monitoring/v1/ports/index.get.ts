import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/ports/inde — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT p.id, p.if_index, p.if_name, p.if_alias, p.oper_status, p.admin_status, p.speed_bps,
       d.id AS device_id, d.hostname,
       m.in_bps, m.out_bps, m.in_util_percent, m.out_util_percent
     FROM monitoring.ports p JOIN monitoring.devices d ON d.id = p.device_id
     LEFT JOIN LATERAL (SELECT * FROM monitoring.port_metrics WHERE port_id = p.id ORDER BY time DESC LIMIT 1) m ON true
     WHERE p.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY oper_status DESC, hostname, if_index LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
