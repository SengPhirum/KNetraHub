import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/bills */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT b.*, (SELECT count(*)::int FROM monitoring.bill_ports WHERE bill_id = b.id) AS port_count,
       h.total_bytes AS current_total_bytes, h.percentile_95_bps AS current_p95_bps, h.overage_bytes AS current_overage_bytes
     FROM monitoring.bills b
     LEFT JOIN LATERAL (SELECT * FROM monitoring.bill_history WHERE bill_id = b.id ORDER BY period_start DESC LIMIT 1) h ON true`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY name LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
