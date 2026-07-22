import { requireUser } from '~~/server/utils/auth'
import { listNotifications } from '~~/server/utils/notificationFeed'

/**
 * The signed-in user's notification feed (navbar bell). Rows are scoped
 * server-side to the apps this user is entitled to; 'portal' rows are
 * admin-only. Returns the newest items plus the unread count for the badge.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const limit = Number(getQuery(event).limit) || 30
  return await listNotifications(user, { limit })
})
