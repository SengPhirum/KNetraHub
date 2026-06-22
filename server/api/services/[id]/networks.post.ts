import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec, toSwarmNetworks } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { networkIds } = await readBody<{ networkIds: string[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.Networks = toSwarmNetworks(networkIds)
  })
  await audit({ actor: user.username, action: 'service.update-networks', target: info.Spec.Name })
  return { ok: true }
})
