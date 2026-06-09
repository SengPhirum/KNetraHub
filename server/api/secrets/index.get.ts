import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
import { STACK_LABEL } from '~~/server/utils/stack'
export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  const items = await useDocker().listSecrets()
  return items.map((s: any) => ({ id: s.ID, name: s.Spec?.Name, stack: s.Spec?.Labels?.[STACK_LABEL] || null, created: s.CreatedAt, updated: s.UpdatedAt }))
})
