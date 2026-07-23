import { requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { softDeleteTask } from '~~/layers/work/server/utils/workTaskWrite'

/**
 * Soft-delete a task and its subtree (reversible via PATCH {deleted:false}).
 * Operators may delete tasks they can edit; hierarchy deletes stay admin-only.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  return softDeleteTask({ user, tier, workspaceId, requestId: requestId(event) }, taskId)
})
