import { requirePermission } from '~~/server/utils/auth'
import { deleteRegistry, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'docker.registry.manage')
  const id = getRouterParam(event, 'id')!
  await deleteRegistry(id)
  await audit({ actor: user.username, action: 'registry.remove', target: id })
  return { ok: true }
})
