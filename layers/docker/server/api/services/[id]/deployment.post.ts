import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'
import { AUTOREDEPLOY_LABEL } from '~~/layers/docker/server/utils/registryClient'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'

interface RestartPolicyInput {
  condition?: 'any' | 'none' | 'on-failure'
  delay?: number
  window?: number
  maxAttempts?: number
}

interface UpdateConfigInput {
  parallelism?: number
  delay?: number
  order?: 'stop-first' | 'start-first'
  failureAction?: 'pause' | 'continue' | 'rollback'
}

interface RollbackConfigInput {
  parallelism?: number
  delay?: number
  order?: 'stop-first' | 'start-first'
  failureAction?: 'pause' | 'continue'
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{
    labels?: Record<string, string>
    autoredeploy?: boolean
    constraints?: string[]
    restartPolicy?: RestartPolicyInput
    updateConfig?: UpdateConfigInput
    rollbackConfig?: RollbackConfigInput
  }>(event)

  const { info } = await withServiceSpec(id, (spec, current) => {
    // The Deployment tab only ever shows/edits service-scope labels (no
    // container-scope split, matching the consolidated wizard) - re-inject
    // com.docker.stack.namespace since the edit form never saw it either.
    const stackNs = current.Spec.Labels?.[STACK_LABEL]
    spec.Labels = { ...(body.labels || {}) }
    if (stackNs) spec.Labels[STACK_LABEL] = stackNs
    if (body.autoredeploy) spec.Labels[AUTOREDEPLOY_LABEL] = 'true'
    else delete spec.Labels[AUTOREDEPLOY_LABEL]

    spec.TaskTemplate.Placement = {
      ...(spec.TaskTemplate.Placement || {}),
      Constraints: (body.constraints || []).filter(Boolean)
    }

    if (body.restartPolicy) {
      spec.TaskTemplate.RestartPolicy = {
        Condition: body.restartPolicy.condition || 'any',
        Delay: (body.restartPolicy.delay ?? 0) * 1e9,
        Window: (body.restartPolicy.window ?? 0) * 1e9,
        MaxAttempts: body.restartPolicy.maxAttempts ?? 0
      }
    }

    if (body.updateConfig) {
      spec.UpdateConfig = {
        Parallelism: body.updateConfig.parallelism ?? 1,
        Delay: (body.updateConfig.delay ?? 0) * 1e9,
        Order: body.updateConfig.order || 'stop-first',
        FailureAction: body.updateConfig.failureAction || 'pause'
      }
    }

    if (body.rollbackConfig) {
      spec.RollbackConfig = {
        Parallelism: body.rollbackConfig.parallelism ?? 1,
        Delay: (body.rollbackConfig.delay ?? 0) * 1e9,
        Order: body.rollbackConfig.order || 'stop-first',
        FailureAction: body.rollbackConfig.failureAction || 'pause'
      }
    }
  })
  await audit({ actor: user.username, action: 'service.update-deployment', target: info.Spec.Name })
  return { ok: true }
})
