import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const info = await docker.getService(id).inspect().catch(() => null)
  await docker.getService(id).remove()
  await audit({ actor: user.username, action: 'service.remove', target: info?.Spec?.Name || id })
  return { ok: true }
})
