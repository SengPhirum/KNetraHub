import { requireApp, requireRole } from '~~/server/utils/auth'
import { getModuleDebug, LOG_MODULES, type LogModule } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const module = LOG_MODULES.includes(q.module as LogModule) ? (q.module as LogModule) : 'portal'
  if (module === 'portal') await requireRole(event, 'manager')
  else await requireApp(event, module, 'manager')
  return await getModuleDebug(module)
})
