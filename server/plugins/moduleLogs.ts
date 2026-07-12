import { readSession } from '../utils/auth'
import { logActivity, moduleForPath, describeAction, runLogHousekeeping } from '../utils/moduleLogs'

/**
 * Central user-activity capture: every authenticated state-changing API call
 * (i.e. what any action button in the UI ultimately does) is recorded in
 * activity_log with the acting user and the module it belongs to. Handlers
 * don't opt in - new endpoints are covered automatically.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('afterResponse', async (event) => {
    try {
      const method = (event.method || event.node.req.method || 'GET').toUpperCase()
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
      const path = (event.path || '').split('?')[0]!
      if (!path.startsWith('/api/')) return
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
        module: moduleForPath(path),
        actor: user.username,
        role: user.role,
        method,
        path,
        action,
        target,
        status: getResponseStatus(event),
        ip
      })
    } catch (err) {
      // Activity capture must never break the request it observes.
      console.error('[moduleLogs] activity capture failed', err)
    }
  })

  // Housekeeping: shortly after boot (so retention applies without waiting a
  // day), then daily. Config lives in app_settings (portal admin editable).
  setTimeout(() => runLogHousekeeping().catch((err) => console.error('[moduleLogs] housekeeping failed', err)), 30_000)
  setInterval(() => runLogHousekeeping().catch((err) => console.error('[moduleLogs] housekeeping failed', err)), 24 * 3600 * 1000)
})
