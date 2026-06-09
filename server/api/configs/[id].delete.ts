import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  await useDocker().getConfig(id).remove()
  await audit({ actor: user.username, action: 'config.remove', target: id })
  return { ok: true }
})
