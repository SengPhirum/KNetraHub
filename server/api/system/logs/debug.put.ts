import { requireApp, requireRole } from '~~/server/utils/auth'
import { setModuleDebug, LOG_MODULES, type LogModule } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ module?: string; enabled?: boolean }>(event)
  const module = LOG_MODULES.includes(body.module as LogModule) ? (body.module as LogModule) : null
  if (!module || typeof body.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Expected a valid module and boolean enabled value' })
  }
  const user = module === 'portal'
    ? await requireRole(event, 'manager')
    : await requireApp(event, module, 'manager')
  return await setModuleDebug(module, body.enabled, user.username)
})
