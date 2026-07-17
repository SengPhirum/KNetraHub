import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, listParams, listEnvelope } from '../../../../../../utils/monApi'

const SORTABLE = ['ip', 'alive', 'already_exists', 'imported']

/** GET /api/monitoring/v1/discovery/scans/:id/candidates — paginated scan results. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const scanId = idParam(event)
  const p = listParams(event, SORTABLE, 'ip')
  const query = getQuery(event)

  const where: string[] = ['scan_id = $1']
  const args: unknown[] = [scanId]
  const add = (sqlTemplate: string, value: unknown) => {
    args.push(value)
    where.push(sqlTemplate.replaceAll('?', `$${args.length}`))
  }
  if (query.alive === '1' || query.alive === 'true') add(`alive = ?`, true)
  if (query.already_exists === '0' || query.already_exists === 'false') add(`already_exists = ?`, false)

  const whereSql = `WHERE ${where.join(' AND ')}`
  const orderSql = p.sort ? `ORDER BY ${p.sort} ${p.order}` : 'ORDER BY alive DESC, ip ASC'

  const totalRes = await db.query(`SELECT count(*)::int AS c FROM monitoring.discovery_candidates ${whereSql}`, args)
  const rows = await db.query(
    `SELECT id, host(ip) AS ip, alive, rtt_ms, already_exists, existing_device_id, imported, imported_device_id
     FROM monitoring.discovery_candidates ${whereSql} ${orderSql} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
