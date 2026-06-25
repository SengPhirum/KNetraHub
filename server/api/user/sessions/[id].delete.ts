import { requireUser } from '~~/server/utils/auth'
import { deleteSession, audit } from '~~/server/utils/store'

/** Revoke one of the caller's own sessions (sign out that device). */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const removed = await deleteSession(id, me.id)
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  await audit({ actor: me.username, action: 'session.revoke', detail: id === me.sid ? 'current device' : 'another device' })
  return { ok: true }
})
