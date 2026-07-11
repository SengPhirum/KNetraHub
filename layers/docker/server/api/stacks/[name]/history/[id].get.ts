import { requireUser } from '~~/server/utils/auth'
import { getStackVersionContent } from '~~/layers/docker/server/utils/stackHistory'

// Compose content of one history entry - id is a local history row id or a
// GitLab commit sha (superset of the older /api/gitlab/[name]/commit route).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = getRouterParam(event, 'name')!
  const id = getRouterParam(event, 'id')!
  const version = await getStackVersionContent(name, id)
  if (!version) throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  return version
})
