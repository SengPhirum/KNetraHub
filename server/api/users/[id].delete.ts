import { requireRole } from '~~/server/utils/auth'
import { deleteUser, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  await deleteUser(id)
  await audit({ actor: admin.username, action: 'user.delete', target: id })
  return { ok: true }
})
