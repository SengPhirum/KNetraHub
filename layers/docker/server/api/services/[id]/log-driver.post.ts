import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { name, options } = await readBody<{ name: string; options?: Record<string, string> }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.LogDriver = name ? { Name: name, Options: options || {} } : undefined
  })
  await audit({ actor: user.username, action: 'service.update-log-driver', target: info.Spec.Name })
  return { ok: true }
})
