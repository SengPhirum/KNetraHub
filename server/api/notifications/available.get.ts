import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { listGlobalChannelsForApp } from '~~/server/utils/notifyStore'

/**
 * Shared (Global) channels an app can choose to use - the "use pre-configured"
 * picker. Each is returned with a `selected` flag = whether this app currently
 * delivers to it. Open to managers of the requested app.
 */
export default defineEventHandler(async (event) => {
  const app = String(getQuery(event).app ?? '')
  if (!app || app === 'global') throw createError({ statusCode: 400, statusMessage: 'An app scope is required' })
  await requireNotificationScope(event, app)
  return await listGlobalChannelsForApp(app)
})
