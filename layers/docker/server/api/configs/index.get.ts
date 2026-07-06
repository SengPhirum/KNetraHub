import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  const items = await useDocker().listConfigs()
  return items.map((c: any) => ({ id: c.ID, name: c.Spec?.Name, stack: c.Spec?.Labels?.[STACK_LABEL] || null, created: c.CreatedAt, updated: c.UpdatedAt }))
})
