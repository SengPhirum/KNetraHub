import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { replicas } = await readBody<{ replicas: number }>(event)
  const { info } = await withServiceSpec(id, (spec, current) => {
    if (!current.Spec.Mode?.Replicated) {
      throw createError({ statusCode: 400, statusMessage: 'Only replicated services can be scaled' })
    }
    spec.Mode = { Replicated: { Replicas: Number(replicas) } }
  })
  await audit({ actor: user.username, action: 'service.scale', target: info.Spec.Name, detail: `replicas=${replicas}` })
  return { ok: true }
})
