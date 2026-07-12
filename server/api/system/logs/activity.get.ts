import { requireApp, requireRole } from '~~/server/utils/auth'
import { listActivity, LOG_MODULES, type LogModule } from '~~/server/utils/moduleLogs'

/**
 * Per-module user activity trail. App-scoped modules are visible to that
 * app's manager tier and up (the same boundary as the app's audit
 * permissions); the portal module needs the global manager role.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const module = LOG_MODULES.includes(q.module as LogModule) ? (q.module as LogModule) : 'portal'
  if (module === 'portal') await requireRole(event, 'manager')
  else await requireApp(event, module, 'manager')
  const limit = q.limit ? Number(q.limit) : 200
  return await listActivity({ module, limit })
})
