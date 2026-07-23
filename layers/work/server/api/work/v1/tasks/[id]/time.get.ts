import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Time entries for a task (running timers included), newest first. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId)
  const { rows } = await getWork().query(
    `SELECT id, username, started_at, ended_at, duration_seconds, note, billable, source,
            CASE WHEN ended_at IS NULL THEN EXTRACT(EPOCH FROM (now() - started_at))::int ELSE duration_seconds END AS effective_seconds
       FROM work.time_entries WHERE task_id = $1 ORDER BY started_at DESC LIMIT 200`, [taskId])
  return rows
})
