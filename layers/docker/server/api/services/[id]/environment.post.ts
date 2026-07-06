import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { env } = await readBody<{ env: Array<{ key: string; value: string }> }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Env = (env || [])
      .filter((e) => e.key)
      .map((e) => `${e.key}=${e.value ?? ''}`)
  })
  await audit({ actor: user.username, action: 'service.update-environment', target: info.Spec.Name })
  return { ok: true }
})
