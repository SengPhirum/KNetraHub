import { requirePermission } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { deleteRegistry, getRegistry, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'docker.registry.manage')
  const id = getRouterParam(event, 'id')!
  const registry = await getRegistry(id)
  await requireDeleteConfirm(event, 'docker.registry', { name: registry?.name })
  await deleteRegistry(id)
  await audit({ actor: user.username, action: 'registry.remove', target: registry?.name || id })
  return { ok: true }
})
