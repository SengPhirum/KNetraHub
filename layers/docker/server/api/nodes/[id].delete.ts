import { requireRole } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const force = getQuery(event).force === 'true'
  await useDocker().getNode(id).remove({ force })
  await audit({ actor: user.username, action: 'node.remove', target: id })
  return { ok: true }
})
