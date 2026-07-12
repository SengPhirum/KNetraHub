import { requireApp, requireRole, resolveUserEntitlements } from '~~/server/utils/auth'
import { listSystem, LOG_MODULES, type LogModule } from '~~/server/utils/moduleLogs'
import { tierAtLeast } from '~~/shared/utils/entitlements'

/** Per-module system/runtime events are available from the app's operator
 * tier. Portal runtime logs retain their global-manager boundary. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const module = LOG_MODULES.includes(q.module as LogModule) ? (q.module as LogModule) : 'portal'
  let canIncludeDebug = false
  if (module === 'portal') {
    await requireRole(event, 'manager')
    canIncludeDebug = true
  } else {
    const user = await requireApp(event, module, 'operator')
    const apps = await resolveUserEntitlements(user)
    canIncludeDebug = tierAtLeast(apps[module], 'manager')
  }
  const limit = q.limit ? Number(q.limit) : 200
  const includeDebug = canIncludeDebug && (q.includeDebug === 'true' || q.includeDebug === '1')
  return await listSystem({ module, limit, includeDebug })
})
