import { requireUser } from '~~/server/utils/auth'
import { markRead, markAllRead } from '~~/server/utils/notificationFeed'

/**
 * Mark feed notifications read for the signed-in user.
 * Body: { all: true } to clear everything, or { ids: [...] } for specific rows.
 * Ids the user isn't entitled to see are ignored server-side.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ all?: boolean; ids?: string[] }>(event)

  if (body?.all) await markAllRead(user)
  else await markRead(user, Array.isArray(body?.ids) ? body.ids.map(String) : [])

  return { ok: true }
})
