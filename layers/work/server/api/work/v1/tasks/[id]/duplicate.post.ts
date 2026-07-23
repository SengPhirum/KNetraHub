import { requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { duplicateTask } from '~~/layers/work/server/utils/workTaskWrite'

/** Duplicate a task with its subtree, checklists, tags, assignees, and fields. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const taskId = String(getRouterParam(event, 'id'))
  return duplicateTask({ user, tier, workspaceId, requestId: requestId(event) }, taskId)
})
