import { requireUser } from '~~/server/utils/auth'
import { updateUser, audit } from '~~/server/utils/store'

/**
 * Self-service profile update for the signed-in user. Unlike the admin-only
 * PATCH /api/users/[id], this is gated by requireUser (any authenticated user)
 * and can only touch the caller's *own* safe fields - display name and password.
 * Role and other accounts can never be changed here. Password changes apply only
 * to local accounts (enforced in updateUser); LDAP/OIDC passwords live in the
 * directory/provider.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = await readBody(event)

  const patch: { displayName?: string; password?: string } = {}
  if (typeof body?.displayName === 'string' && body.displayName.trim()) patch.displayName = body.displayName.trim()
  if (typeof body?.password === 'string' && body.password) patch.password = body.password

  if (!patch.displayName && !patch.password) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  }

  const u = await updateUser(me.id, patch)
  await audit({ actor: me.username, action: 'user.self_update', target: u.username })
  return { id: u.id, username: u.username, displayName: u.displayName, email: u.email, role: u.role, source: u.source }
})
