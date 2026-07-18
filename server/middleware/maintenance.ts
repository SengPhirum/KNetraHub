import { readSession } from '~~/server/utils/auth'
import { getMaintenanceSettings } from '~~/server/utils/maintenanceSettings'

/**
 * Maintenance-mode lockout, enforced server-side: while enabled, only admins
 * may use the API — every other authenticated role gets 503 so the lockout
 * cannot be bypassed by calling endpoints directly.
 *
 * Allowlisted paths keep the essentials working during maintenance:
 * signing in/out (an admin has to be able to get in to turn it off), session
 * hydration, login-screen branding, the maintenance state itself (the shell
 * needs it to render the lockout page), and framework internals (/api/_*).
 * Unauthenticated requests pass through — each endpoint's own auth 401s.
 */
const ALLOW_PREFIXES = ['/api/auth/', '/api/_', '/api/system/maintenance', '/api/settings/appearance', '/api/user/']
const ALLOW_EXACT = ['/api/user']

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? ''
  if (!path.startsWith('/api/')) return
  if (ALLOW_EXACT.includes(path) || ALLOW_PREFIXES.some((p) => path.startsWith(p))) return

  const settings = await getMaintenanceSettings()
  if (!settings.maintenance.enabled) return

  const user = await readSession(event)
  if (!user || user.role === 'admin') return

  throw createError({
    statusCode: 503,
    statusMessage: settings.maintenance.title || 'System under maintenance'
  })
})
