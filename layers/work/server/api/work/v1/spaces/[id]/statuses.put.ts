import { requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'
import { replaceStatuses } from '~~/layers/work/server/utils/workStatuses'

/** Replace a space's status workflow (full ordered set; see workStatuses). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const spaceId = String(getRouterParam(event, 'id'))
  await assertSpaceAccess(user, tier, workspaceId, spaceId, 'full')
  const body = await readBody(event)
  return replaceStatuses({
    user, workspaceId, spaceId, listId: null,
    entries: body?.statuses, force: body?.force === true, requestId: requestId(event)
  })
})
