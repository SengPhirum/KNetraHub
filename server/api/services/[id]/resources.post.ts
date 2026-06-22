import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'

interface ResourceBlock {
  nanoCpus?: number
  memoryBytes?: number
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { reservation, limit } = await readBody<{ reservation?: ResourceBlock; limit?: ResourceBlock }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.Resources = {
      Reservations: {
        NanoCPUs: reservation?.nanoCpus || undefined,
        MemoryBytes: reservation?.memoryBytes || undefined
      },
      Limits: {
        NanoCPUs: limit?.nanoCpus || undefined,
        MemoryBytes: limit?.memoryBytes || undefined
      }
    }
  })
  await audit({ actor: user.username, action: 'service.update-resources', target: info.Spec.Name })
  return { ok: true }
})
