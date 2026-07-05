import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { replicas } = await readBody<{ replicas: number }>(event)
  const { info } = await withServiceSpec(id, (spec, current) => {
    if (!current.Spec.Mode?.Replicated) {
      throw createError({ statusCode: 400, statusMessage: 'Only replicated services can be scaled' })
    }
    spec.Mode = { Replicated: { Replicas: Number(replicas) } }
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: id, severity: 'critical', vars: { target: id, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'service.scale', target: info.Spec.Name, detail: `replicas=${replicas}` })
  return { ok: true }
})
