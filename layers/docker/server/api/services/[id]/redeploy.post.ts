import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  let serviceName = id
  const result = await withServiceSpec(id, (spec, current) => {
    serviceName = current.Spec?.Name || id
    // Bumping ForceUpdate alone recreates tasks but reuses whatever image
    // digest is already pinned in the spec - it does NOT re-pull, so a
    // newly-pushed image under the same tag is never picked up. Strip any
    // pinned digest so Swarm re-resolves the tag against the registry too,
    // the same way `docker service update --image <repo>:<tag>` (or the
    // autoredeploy poller) does.
    const container = spec.TaskTemplate?.ContainerSpec
    if (container?.Image) container.Image = container.Image.split('@')[0]
    spec.TaskTemplate = { ...spec.TaskTemplate, ForceUpdate: (spec.TaskTemplate?.ForceUpdate || 0) + 1 }
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: serviceName, severity: 'critical', vars: { target: serviceName, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  const { info } = result
  await audit({ actor: user.username, action: 'service.redeploy', target: info.Spec.Name })
  await fireAlert({
    ruleType: 'service_redeployed',
    target: info.Spec.Name,
    severity: 'info',
    vars: { target: info.Spec.Name, trigger: 'manual', actor: user.username, time: new Date().toISOString() }
  })
  return { ok: true }
})
