import { requireApp, requireRole } from '~~/server/utils/auth'
import { listSystem, LOG_MODULES, type LogModule } from '~~/server/utils/moduleLogs'

/** Per-module system/runtime events are available from the app's operator
 * tier. Portal runtime logs retain their global-manager boundary. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const module = LOG_MODULES.includes(q.module as LogModule) ? (q.module as LogModule) : 'portal'
  if (module === 'portal') await requireRole(event, 'manager')
  else await requireApp(event, module, 'operator')
  const limit = q.limit ? Number(q.limit) : 200
  return await listSystem({ module, limit })
})
