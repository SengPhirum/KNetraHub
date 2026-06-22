import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec, toSwarmMounts, type MountInput } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { mounts } = await readBody<{ mounts: MountInput[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Mounts = toSwarmMounts(mounts)
  })
  await audit({ actor: user.username, action: 'service.update-mounts', target: info.Spec.Name })
  return { ok: true }
})
