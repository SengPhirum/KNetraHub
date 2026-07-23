import { requireWork } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'
import { taskDetail } from '~~/layers/work/server/utils/workTasks'

/** Full task detail (satellites, checklists, dependencies, fields, subtasks). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId)
  return taskDetail(user, tier, workspaceId, taskId)
})
