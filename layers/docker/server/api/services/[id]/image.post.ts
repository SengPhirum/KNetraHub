import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { image } = await readBody<{ image: string }>(event)
  let previousImage = ''
  let serviceName = id
  const { info } = await withServiceSpec(id, (spec, current) => {
    serviceName = current.Spec?.Name || id
    previousImage = (spec.TaskTemplate.ContainerSpec!.Image || '').split('@')[0]
    spec.TaskTemplate.ContainerSpec!.Image = image
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: serviceName, severity: 'critical', vars: { target: serviceName, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'service.update-image', target: info.Spec.Name, detail: image })
  await fireAlert({
    ruleType: 'service_image_updated',
    target: info.Spec.Name,
    severity: 'info',
    vars: { target: info.Spec.Name, image, previousImage: previousImage || '?', actor: user.username, time: new Date().toISOString() }
  })
  return { ok: true }
})
