import { requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { patchTask } from '~~/layers/work/server/utils/workTaskWrite'

/** Whitelisted partial task update with optimistic concurrency (version). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  const body = await readBody(event)
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'A JSON body is required' })
  return patchTask({ user, tier, workspaceId, requestId: requestId(event) }, taskId, body)
})
