import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'
import { JOB_STATES, JOB_TYPES } from '../../../../../shared/constants'

/** GET /api/monitoring/v1/pollers/jobs — recent/failed jobs (filter ?state= &type=). */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const query = getQuery(event)

  const where: string[] = []
  const args: unknown[] = []
  if (query.state && (JOB_STATES as readonly string[]).includes(String(query.state))) {
    args.push(String(query.state))
    where.push(`j.state = $${args.length}`)
  } else {
    // Include pending so a backlog (e.g. jobs stuck under a poller_group with
    // no active node) is visible by default instead of hidden until an
    // operator thinks to switch the filter.
    where.push(`j.state IN ('pending','failed','dead','running')`)
  }
  if (query.type && (JOB_TYPES as readonly string[]).includes(String(query.type))) {
    args.push(String(query.type))
    where.push(`j.type = $${args.length}`)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`

  const totalRes = await db.query(`SELECT count(*)::int AS c FROM monitoring.jobs j ${whereSql}`, args)
  const rows = await db.query(
    `SELECT j.id, j.type, j.device_id, d.hostname, j.state, j.priority, j.attempts, j.max_attempts,
            j.run_at, j.locked_by, j.last_error, j.created_at, j.finished_at
     FROM monitoring.jobs j LEFT JOIN monitoring.devices d ON d.id = j.device_id
     ${whereSql}
     ORDER BY j.created_at DESC
     LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
