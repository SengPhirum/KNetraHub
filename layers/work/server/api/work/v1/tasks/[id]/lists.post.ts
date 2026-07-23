import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertListAccess, assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Add the task to an additional list (beyond its home list). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  const { task } = await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const body = await readBody(event)
  const listId = String(body?.list_id || '')
  if (!listId) throw createError({ statusCode: 400, statusMessage: 'list_id is required' })
  if (listId === task.list_id) throw createError({ statusCode: 400, statusMessage: 'That is already the task\'s home list' })
  await assertListAccess(user, tier, workspaceId, listId, 'edit')
  await getWork().query(
    'INSERT INTO work.task_list_memberships (task_id, list_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [taskId, listId, user.username])
  return { ok: true }
})
