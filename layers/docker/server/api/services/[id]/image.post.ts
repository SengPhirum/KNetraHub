import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { image } = await readBody<{ image: string }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec!.Image = image
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: id, severity: 'critical', vars: { target: id, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'service.update-image', target: info.Spec.Name, detail: image })
  return { ok: true }
})
