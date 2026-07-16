import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/pollers — poller nodes + queue health. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()

  const nodes = await db.query(
    `SELECT id, poller_group, version, started_at, last_heartbeat_at, worker_concurrency,
            jobs_in_progress, jobs_completed, jobs_failed, enabled,
            (last_heartbeat_at > now() - interval '30 seconds') AS healthy
     FROM monitoring.poller_nodes ORDER BY id`
  )
  const queue = await db.query(
    `SELECT state, count(*)::int AS c FROM monitoring.jobs GROUP BY state`
  )
  const backlog = await db.query(
    `SELECT count(*)::int AS pending_due FROM monitoring.jobs WHERE state = 'pending' AND run_at <= now()`
  )
  const oldest = await db.query(
    `SELECT min(run_at) AS oldest_pending FROM monitoring.jobs WHERE state = 'pending' AND run_at <= now()`
  )

  return {
    nodes: nodes.rows,
    queue: Object.fromEntries(queue.rows.map((r: any) => [r.state, r.c])),
    pending_due: Number(backlog.rows[0].pending_due),
    oldest_pending: oldest.rows[0].oldest_pending
  }
})
