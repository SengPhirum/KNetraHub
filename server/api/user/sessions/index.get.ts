import { requireUser } from '~~/server/utils/auth'
import { listSessions } from '~~/server/utils/store'

/** The signed-in user's own active sessions, with the current one flagged. */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const sessions = await listSessions(me.id)
  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    lastSeen: s.lastSeen,
    userAgent: s.userAgent,
    ip: s.ip,
    current: s.id === me.sid
  }))
})
