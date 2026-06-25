import { clearAuthSession, readSession } from '~~/server/utils/auth'
import { deleteSession } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  // Remove this device's session row (so the token can't be reused) before
  // clearing the cookie. Best-effort: a failed delete still clears the cookie.
  const user = await readSession(event)
  if (user?.sid) await deleteSession(user.sid, user.id).catch(() => {})
  clearAuthSession(event)
  return { ok: true }
})
