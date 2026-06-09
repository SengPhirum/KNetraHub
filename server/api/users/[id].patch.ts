import { requireRole } from '~~/server/utils/auth'
import { updateUser, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const u = await updateUser(id, await readBody(event))
  await audit({ actor: admin.username, action: 'user.update', target: u.username })
  return u
})
