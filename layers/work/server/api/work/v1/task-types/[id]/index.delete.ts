import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'

/** Delete a task type (admin). Tasks keep working — their type becomes unset. */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWorkPermission(event, 'work.settings')
  const typeId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.task_types WHERE id = $1 AND workspace_id = $2', [typeId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Task type not found' })
  if (rows[0].is_default) throw createError({ statusCode: 400, statusMessage: 'The default task type cannot be deleted' })
  const usage = await db.query('SELECT count(*)::int AS n FROM work.tasks WHERE type_id = $1 AND deleted_at IS NULL', [typeId])
  // tasks.type_id is ON DELETE SET NULL — existing tasks keep working untyped.
  await db.query('DELETE FROM work.task_types WHERE id = $1', [typeId])
  await workAudit(user, 'task_type.deleted', typeId, `${rows[0].name} (${usage.rows[0].n} task(s) now untyped)`)
  return { deleted: true, tasks_untyped: usage.rows[0].n }
})
