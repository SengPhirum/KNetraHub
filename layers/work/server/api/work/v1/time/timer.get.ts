import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'

/** The caller's currently running timer (or null). */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWork(event)
  const { rows } = await getWork().query(
    `SELECT e.id, e.task_id, e.started_at, t.name AS task_name, t.custom_id,
            EXTRACT(EPOCH FROM (now() - e.started_at))::int AS running_seconds
       FROM work.time_entries e JOIN work.tasks t ON t.id = e.task_id
      WHERE e.workspace_id = $1 AND lower(e.username) = lower($2) AND e.ended_at IS NULL`,
    [workspaceId, user.username])
  return rows[0] || null
})
