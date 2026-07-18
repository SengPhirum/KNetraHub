import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/switching/neighbor — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT t.id, t.protocol, t.remote_hostname, t.remote_port, t.remote_platform, t.remote_device_id, t.port_id, d.id AS device_id, d.hostname
     FROM monitoring.topology_links t JOIN monitoring.devices d ON d.id = t.device_id WHERE t.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY hostname LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
