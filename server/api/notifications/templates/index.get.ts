import { requireRole } from '~~/server/utils/auth'
import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { listTemplates } from '~~/server/utils/notifyStore'

export default defineEventHandler(async (event) => {
  const scope = getQuery(event).scope
  if (typeof scope === 'string' && scope && scope !== 'global') {
    await requireNotificationScope(event, scope)
    return await listTemplates(scope)
  }
  await requireRole(event, 'admin')
  return await listTemplates(typeof scope === 'string' && scope ? scope : undefined)
})
