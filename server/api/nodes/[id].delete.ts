import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const force = getQuery(event).force === 'true'
  await useDocker().getNode(id).remove({ force })
  await audit({ actor: user.username, action: 'node.remove', target: id })
  return { ok: true }
})
