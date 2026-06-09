import { requireRole } from '~~/server/utils/auth'
import { deleteRegistry, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  await deleteRegistry(id)
  await audit({ actor: user.username, action: 'registry.remove', target: id })
  return { ok: true }
})
