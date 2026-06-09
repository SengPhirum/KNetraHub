import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  await useDocker().getVolume(name).remove({ force: getQuery(event).force === 'true' })
  await audit({ actor: user.username, action: 'volume.remove', target: name })
  return { ok: true }
})
