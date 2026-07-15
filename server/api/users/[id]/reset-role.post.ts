import { requireRole } from '~~/server/utils/auth'
import { resetUserRole, audit } from '~~/server/utils/store'

/** Clears a user's manual-role lock so their next OIDC/LDAP login re-applies
 *  the provider's group-mapped role (see upsertExternalUser). */
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const u = await resetUserRole(id)
  await audit({ actor: admin.username, action: 'user.role.reset', target: u.username })
  return u
})
