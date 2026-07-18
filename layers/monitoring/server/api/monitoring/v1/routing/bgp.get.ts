import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/routing/bg — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT b.id, b.peer_ip, b.peer_as, b.local_as, b.state, b.admin_status, b.established_seconds, b.accepted_prefixes, d.id AS device_id, d.hostname
     FROM monitoring.bgp_peers b JOIN monitoring.devices d ON d.id = b.device_id WHERE b.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY (state = 'established') ASC, hostname LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
