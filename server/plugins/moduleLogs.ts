import { readSession } from '../utils/auth'
import { logActivity, logSystem, moduleForPath, describeAction, runLogHousekeeping } from '../utils/moduleLogs'

/**
 * Central user-activity capture: every authenticated state-changing API call
 * (i.e. what any action button in the UI ultimately does) is recorded in
 * activity_log with the acting user and the module it belongs to. Handlers
 * don't opt in - new endpoints are covered automatically.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    event.context.moduleLogStartedAt = Date.now()
  })

  nitro.hooks.hook('afterResponse', async (event) => {
    try {
      const method = (event.method || event.node.req.method || 'GET').toUpperCase()
      const path = (event.path || '').split('?')[0]!
      if (!path.startsWith('/api/')) return
      const module = moduleForPath(path)
      const status = getResponseStatus(event)
      const startedAt = Number(event.context.moduleLogStartedAt) || Date.now()
      const durationMs = Math.max(0, Date.now() - startedAt)

      await logSystem(module, 'debug', 'http.request', `${method} ${path} -> ${status} (${durationMs}ms)`)
      if (status >= 500) {
        await logSystem(module, 'error', 'http.request.failed', `${method} ${path} -> ${status} (${durationMs}ms)`)
      }

      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
      // Auth endpoints log their own success/failure system events and mostly
      // run without a session yet.
      if (path.startsWith('/api/auth/')) return
      const user = await readSession(event)
      if (!user) return
      const { action, target } = describeAction(method, path)
      const forwarded = getRequestHeader(event, 'x-forwarded-for')
      const ip = (forwarded ? forwarded.split(',')[0]!.trim() : '')
        || getRequestHeader(event, 'x-real-ip')
        || event.node.req.socket?.remoteAddress
        || undefined
      await logActivity({
        module,
        actor: user.username,
        role: user.role,
        method,
        path,
        action,
        target,
        status,
        ip
      })
    } catch (err) {
      // Diagnostic/activity capture must never break the request it observes.
      console.error('[moduleLogs] request capture failed', err)
    }
  })

  // Housekeeping: shortly after boot (so retention applies without waiting a
  // day), then daily. Config lives in app_settings (portal admin editable).
  setTimeout(() => runLogHousekeeping().catch((err) => console.error('[moduleLogs] housekeeping failed', err)), 30_000)
  setInterval(() => runLogHousekeeping().catch((err) => console.error('[moduleLogs] housekeeping failed', err)), 24 * 3600 * 1000)
})
