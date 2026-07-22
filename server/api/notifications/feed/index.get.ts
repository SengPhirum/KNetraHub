import { requireUser } from '~~/server/utils/auth'
import { listNotifications } from '~~/server/utils/notificationFeed'

/**
 * The signed-in user's notification feed (navbar bell). Rows are scoped
 * server-side to the apps this user is entitled to; 'portal' rows are
 * admin-only. Returns the newest items plus the unread count for the badge.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const q = getQuery(event)
  return await listNotifications(user, {
    limit: Number(q.limit) || 30,
    offset: Number(q.offset) || 0,
    app: q.app ? String(q.app) : undefined,
    severity: q.severity ? String(q.severity) : undefined,
    unreadOnly: q.unread === '1' || q.unread === 'true'
  })
})
