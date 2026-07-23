import { getWork, newId, optionalDate, optionalText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Add a manual time entry to a task. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.time')
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const body = await readBody(event)

  const duration = Number(body?.duration_seconds)
  if (!Number.isInteger(duration) || duration <= 0 || duration > 60 * 60 * 24 * 31) {
    throw createError({ statusCode: 400, statusMessage: 'duration_seconds must be a positive number of seconds' })
  }
  const startedAt = optionalDate(body?.started_at, 'Start time') || new Date(Date.now() - duration * 1000).toISOString()
  const endedAt = new Date(Date.parse(startedAt) + duration * 1000).toISOString()

  const id = newId()
  await getWork().query(
    `INSERT INTO work.time_entries (id, workspace_id, task_id, username, started_at, ended_at, duration_seconds, note, billable, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$4)`,
    [id, workspaceId, taskId, user.username.toLowerCase(), startedAt, endedAt, duration,
      optionalText(body?.note, 'Note', 500), body?.billable === true])
  return { id }
})
