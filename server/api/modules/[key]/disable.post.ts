import { requireRole } from '~~/server/utils/auth'
import { disableModule } from '~~/server/utils/moduleLifecycle'
import { listModuleRuntimeStates } from '~~/server/utils/moduleDb'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const key = String(getRouterParam(event, 'key') || '')
  await disableModule(key, user.username)
  await audit({ actor: user.username, action: 'module.disable', target: key, detail: 'Database retained; runtime access disabled' })
  return { module: (await listModuleRuntimeStates(true)).find((module) => module.key === key) }
})
