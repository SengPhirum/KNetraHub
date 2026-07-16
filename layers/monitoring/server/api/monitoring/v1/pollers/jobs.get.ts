import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/pollers/jobs — recent/failed jobs (filter ?state=). */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const query = getQuery(event)

  const args: unknown[] = []
  let stateFilter = ''
  if (query.state) {
    args.push(String(query.state))
    stateFilter = `WHERE j.state = $${args.length}`
  } else {
    stateFilter = `WHERE j.state IN ('failed','dead','running')`
  }

  const rows = await db.query(
    `SELECT j.id, j.type, j.device_id, d.hostname, j.state, j.priority, j.attempts, j.max_attempts,
            j.run_at, j.locked_by, j.last_error, j.created_at, j.finished_at
     FROM monitoring.jobs j LEFT JOIN monitoring.devices d ON d.id = j.device_id
     ${stateFilter}
     ORDER BY j.created_at DESC
     LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  return listEnvelope(rows.rows, rows.rows.length, p)
})
