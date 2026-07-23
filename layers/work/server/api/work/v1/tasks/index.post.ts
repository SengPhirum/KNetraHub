import { requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { createTask } from '~~/layers/work/server/utils/workTaskWrite'

/** Create a task or subtask. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  return createTask({ user, tier, workspaceId, requestId: requestId(event) }, {
    listId: String(body?.list_id || ''),
    name: body?.name,
    description: body?.description,
    parentId: body?.parent_id,
    typeId: body?.type_id,
    statusId: body?.status_id,
    priority: body?.priority,
    startAt: body?.start_at,
    dueAt: body?.due_at,
    allDay: body?.all_day,
    timeEstimateMinutes: body?.time_estimate_minutes,
    assignees: body?.assignees,
    tags: body?.tags,
    source: body?.source
  })
})
