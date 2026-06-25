import { requireUser } from '~~/server/utils/auth'
import { deleteUserSessions, audit } from '~~/server/utils/store'

/** "Sign out everywhere else" - revoke all of the caller's sessions except the
 *  current device. If called from API-token auth (no sid) it revokes them all. */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const count = await deleteUserSessions(me.id, me.sid)
  await audit({ actor: me.username, action: 'session.revoke_others', detail: `${count} session(s)` })
  return { ok: true, revoked: count }
})
