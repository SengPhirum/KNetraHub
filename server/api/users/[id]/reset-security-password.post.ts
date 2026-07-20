import { requireRole } from '~~/server/utils/auth'
import { clearSecurityPassword, audit, listUsers } from '~~/server/utils/store'

/** Portal-admin reset of a user's security password: clears it so the user is
 *  prompted to set a new one on their next login. The admin never sees or sets
 *  the value - only the owner can choose it. */
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const target = (await listUsers()).find((u) => u.id === id)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  await clearSecurityPassword(id)
  await audit({ actor: admin.username, action: 'user.security_password.reset', target: target.username })
  return { id, securityPasswordSet: false }
})
