import { requireRole } from '~~/server/utils/auth'
import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { listChannels } from '~~/server/utils/notifyStore'

/** Central notification channels (summaries only - config is never returned).
 *  A ?scope=<app> read is open to that app's managers; the unscoped (all)
 *  read is portal-admin only. */
export default defineEventHandler(async (event) => {
  const scope = getQuery(event).scope
  if (typeof scope === 'string' && scope && scope !== 'global') {
    await requireNotificationScope(event, scope)
    return await listChannels(scope)
  }
  await requireRole(event, 'admin')
  return await listChannels(typeof scope === 'string' && scope ? scope : undefined)
})
