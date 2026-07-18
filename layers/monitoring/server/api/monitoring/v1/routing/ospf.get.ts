import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/routing/osp — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT o.id, o.neighbor_ip, o.neighbor_router_id, o.state, d.id AS device_id, d.hostname
     FROM monitoring.ospf_neighbors o JOIN monitoring.devices d ON d.id = o.device_id WHERE o.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY (state = 'full') ASC, hostname LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
