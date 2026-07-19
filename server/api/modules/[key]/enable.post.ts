import { requireRole } from '~~/server/utils/auth'
import { enableModule, type ModuleDatabaseInput } from '~~/server/utils/moduleLifecycle'
import { listModuleRuntimeStates } from '~~/server/utils/moduleDb'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const key = String(getRouterParam(event, 'key') || '')
  const body = await readBody<{ database?: ModuleDatabaseInput }>(event)
  await enableModule(key, body?.database || null, user.username)
  await audit({
    actor: user.username,
    action: 'module.enable',
    target: key,
    detail: body?.database ? `Initialized ${body.database.database}` : 'Re-enabled existing database'
  })
  return { module: (await listModuleRuntimeStates(true)).find((module) => module.key === key) }
})
