import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { hosts } = await readBody<{ hosts: string[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Hosts = (hosts || []).filter(Boolean)
  })
  await audit({ actor: user.username, action: 'service.update-extra-hosts', target: info.Spec.Name })
  return { ok: true }
})
