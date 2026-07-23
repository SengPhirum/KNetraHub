import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Remove the task from an additional list (home list is unaffected). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  const listId = String(getRouterParam(event, 'listId'))
  await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  await getWork().query('DELETE FROM work.task_list_memberships WHERE task_id = $1 AND list_id = $2', [taskId, listId])
  return { ok: true }
})
