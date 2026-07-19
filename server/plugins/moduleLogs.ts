import { readSession } from '../utils/auth'
import { nanoid } from 'nanoid'
import { logActivity, logActionNotification, logSystem, moduleForPath, describeAction, runLogHousekeeping } from '../utils/moduleLogs'

/**
 * Central user-activity capture: every authenticated state-changing API call
 * (i.e. what any action button in the UI ultimately does) is recorded in
 * activity_log with the acting user and the module it belongs to. Handlers
 * don't opt in - new endpoints are covered automatically.
 *
 * On top of the audit trail, every API request also feeds system_log
 * (printed to the console and retained per the housekeeping config):
 *  - debug:   every request with method/path/status/duration (opt-in per module)
 *  - info:    every successful state-changing action, with the acting user
 *  - warning: rejected state-changing actions (4xx - validation, conflicts,
 *             permission or password-confirmation failures)
 *  - error:   handler failures (5xx), with the underlying error message
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// High-frequency machine-to-machine ingest - keep it out of the info trail
// (it still shows in the debug trail when module debug is enabled).
const INFO_EXCLUDED_PREFIXES = ['/api/agent/report']
const ACTION_NOTIFICATION_EXCLUDED_PREFIXES = ['/api/agent/report']

function notificationTarget(event: any, fallback?: string): string | undefined {
  const supplied = getRequestHeader(event, 'x-knetra-action-target')?.trim()
  return (supplied || fallback)?.slice(0, 160)
}

async function recordActionStage(event: any, stage: 'started' | 'succeeded' | 'failed', status?: number, detail?: string) {
  const context = event.context?.actionNotification
  if (!context || (stage !== 'started' && context.completed)) return
  if (stage !== 'started') context.completed = true
  await logActionNotification({
    operationId: context.operationId,
    actor: context.actor,
    module: context.module,
    action: context.action,
    target: context.target,
    stage,
    status,
    detail
  })
}

function requestMeta(event: any) {
  const method = (event.method || event.node?.req?.method || 'GET').toUpperCase()
  const path = (event.path || '').split('?')[0] as string
  const startedAt = Number(event.context?.moduleLogStartedAt) || Date.now()
  return { method, path, module: moduleForPath(path), durationMs: Math.max(0, Date.now() - startedAt) }
}

function clientIp(event: any): string | undefined {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  return (forwarded ? forwarded.split(',')[0]!.trim() : '')
    || getRequestHeader(event, 'x-real-ip')
    || event.node?.req?.socket?.remoteAddress
    || undefined
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', async (event) => {
    event.context.moduleLogStartedAt = Date.now()
    try {
      const { method, path, module } = requestMeta(event)
      if (!path.startsWith('/api/') || !WRITE_METHODS.has(method) || path.startsWith('/api/auth/')) return
      if (ACTION_NOTIFICATION_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return
      const user = await readSession(event).catch(() => null)
      if (!user) return
      const described = describeAction(method, path)
      event.context.actionNotification = {
        operationId: nanoid(), actor: user.username, module,
        action: described.action, target: notificationTarget(event, described.target), completed: false
      }
      await recordActionStage(event, 'started')
    } catch (err) {
      console.error('[moduleLogs] action start capture failed', err)
    }
  })

  // Failed requests: thrown errors (createError, dockerode, pg, ...) never
  // reach afterResponse, so they are captured here - with the real error
  // message, e.g. "network knet_frontend is in use by service traefik".
  nitro.hooks.hook('error', async (error: any, { event }: any = {}) => {
    try {
      if (!event) return
      const { method, path, module, durationMs } = requestMeta(event)
      if (!path.startsWith('/api/')) return
      if (event.context.moduleLogErrorLogged) return
      event.context.moduleLogErrorLogged = true

      const status = Number(error?.statusCode) || 500
      const message = error?.statusMessage || error?.message || 'Unknown error'
      const isWrite = WRITE_METHODS.has(method)

      await logSystem(module, 'debug', 'http.request', `${method} ${path} -> ${status} (${durationMs}ms)`)

      const user = await readSession(event).catch(() => null)
      const actor = user ? ` (user: ${user.username})` : ''
      if (status >= 500) {
        await logSystem(module, 'error', 'api.error', `${method} ${path} -> ${status}: ${message}${actor}`)
      } else if (isWrite) {
        await logSystem(module, 'warning', 'api.rejected', `${method} ${path} -> ${status}: ${message}${actor}`)
      }

      // Failed write attempts belong in the audit trail too - "who tried to
      // delete X and was refused" matters as much as who succeeded.
      if (isWrite) await recordActionStage(event, 'failed', status, String(message))
      if (isWrite && user && !path.startsWith('/api/auth/')) {
        const { action, target } = describeAction(method, path)
        await logActivity({
          module, actor: user.username, role: user.role, method, path,
          action, target, status, ip: clientIp(event), detail: String(message).slice(0, 500)
        })
      }
    } catch (err) {
      console.error('[moduleLogs] error capture failed', err)
    }
  })

  nitro.hooks.hook('afterResponse', async (event) => {
    try {
      const { method, path, module, durationMs } = requestMeta(event)
      if (!path.startsWith('/api/')) return
      // Already fully captured by the error hook for this request.
      if (event.context.moduleLogErrorLogged) return
      const status = getResponseStatus(event)

      await logSystem(module, 'debug', 'http.request', `${method} ${path} -> ${status} (${durationMs}ms)`)
      if (status >= 500) {
        await logSystem(module, 'error', 'api.error', `${method} ${path} -> ${status} (${durationMs}ms)`)
      }

      if (!WRITE_METHODS.has(method)) return
      // Auth endpoints log their own success/failure system events and mostly
      // run without a session yet.
      if (path.startsWith('/api/auth/')) return
      const user = await readSession(event)
      if (!user) return
      const { action, target } = describeAction(method, path)

      if (status < 400 && !INFO_EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) {
        await logSystem(module, 'info', 'api.action',
          `${user.username} ${action}${target ? ` "${target}"` : ''} -> ${status}`)
      }

      await recordActionStage(event, status < 400 ? 'succeeded' : 'failed', status)
      await logActivity({
        module,
        actor: user.username,
        role: user.role,
        method,
        path,
        action,
        target,
        status,
        ip: clientIp(event)
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
