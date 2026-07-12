import { requireRole } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  await requirePasswordConfirm(event)
  const name = getRouterParam(event, 'name')!
  await useDocker().getVolume(name).remove({ force: getQuery(event).force === 'true' })
  await audit({ actor: user.username, action: 'volume.remove', target: name })
  return { ok: true }
})
