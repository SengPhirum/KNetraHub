import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { image } = await readBody<{ image: string }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec!.Image = image
  })
  await audit({ actor: user.username, action: 'service.update-image', target: info.Spec.Name, detail: image })
  return { ok: true }
})
