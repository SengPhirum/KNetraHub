import { readSession, resolveUserEntitlements } from '~~/server/utils/auth'
import type { AppKey } from '../../shared/utils/entitlements'

/**
 * Authoritative per-app access gate (KNetraHub). Every API route that belongs
 * to a sub-app (Dock/Docker, Monitoring) is allowed only if the caller has an
 * entitlement for that app (resolved from their Keycloak realm roles + the
 * Settings app-role map, or the local-admin superuser bypass). It also
 * publishes the caller's effective tier on event.context so endpoint handlers'
 * requireRole/requirePermission checks enforce the per-app tier instead of the
 * global role - without those handlers changing.
 *
 * Enforcement differs per app because of handler history:
 *  - docker routes: handlers all call requireUser/requireRole themselves, so an
 *    unauthenticated request falls through for the handler to 401 cleanly.
 *  - monitoring routes (/api/monitoring): this middleware IS the
 *    authentication boundary - unauthenticated requests are rejected here, and
 *    read access requires at least a viewer tier. Mutation endpoints
 *    additionally call requireMonitoring(...) for their operator/admin tier.
 *    Poller-node worker auth (signed requests) is handled inside the
 *    monitoring layer, not here.
 *
 * IPMgt guards itself per-handler (requireIpam). Routes not matched here
 * (auth, user prefs, settings, portal audit) keep their original guards.
 */

// Ordered: first matching prefix wins, so the more specific /api/sse/monitoring
// must precede /api/sse (the docker events stream).
const APP_PREFIXES: [string, AppKey][] = [
  ['/api/sse/monitoring', 'monitoring'],
  ['/api/monitoring', 'monitoring'],
  ['/api/services', 'docker'],
  ['/api/stacks', 'docker'],
  ['/api/nodes', 'docker'],
  ['/api/tasks', 'docker'],
  ['/api/containers', 'docker'],
  ['/api/networks', 'docker'],
  ['/api/volumes', 'docker'],
  ['/api/secrets', 'docker'],
  ['/api/configs', 'docker'],
  ['/api/registries', 'docker'],
  ['/api/alerts', 'docker'],
  ['/api/gitlab', 'docker'],
  ['/api/sse', 'docker'],
  ['/api/system/overview', 'docker'],
  ['/api/system/metrics', 'docker']
]

function appForRoute(path: string): AppKey | null {
  for (const [p, app] of APP_PREFIXES) {
    if (path === p || path.startsWith(p + '/') || path.startsWith(p + '?')) return app
  }
  return null
}

const APP_LABEL: Record<AppKey, string> = { docker: 'Dock', monitoring: 'Monitoring', ipmgt: 'IP Management' }

export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return
  const app = appForRoute(path)
  if (!app) return

  const user = await readSession(event)
  if (!user) {
    // Docker handlers 401 via their own requireUser; monitoring handlers
    // historically had no guards, so the middleware must reject here.
    if (app === 'docker') return
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const apps = await resolveUserEntitlements(user)
  const tier = apps[app]
  if (!tier) {
    throw createError({ statusCode: 403, statusMessage: `No access to the ${APP_LABEL[app]} app` })
  }

  // Hand the resolved tier to requireRole/requirePermission downstream.
  event.context.effectiveApp = app
  event.context.effectiveTier = tier
})
