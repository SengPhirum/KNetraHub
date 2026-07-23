import type { AppKey } from '../../shared/utils/entitlements'

/**
 * Which page routes belong to which app. The "Dock" app keeps the original
 * Docker Swarm page paths (no mass URL rewrite); its dashboard lives at /dock.
 * Monitoring (merged Network + Server) and IP Management are in-process SPA
 * modules owning the /monitoring and /ipmgt route subtrees respectively.
 * Legacy /net and /server links are redirected to /monitoring/network and
 * /monitoring/server by legacy-monitoring.global.ts. Used by the contextual
 * sidebar (useNav) and the client access guard (route-access).
 */
export const DOCKER_ROUTE_PREFIXES = [
  '/docker',
  '/nodes',
  '/stacks',
  '/services',
  '/tasks',
  '/containers',
  '/networks',
  '/volumes',
  '/secrets',
  '/configs',
  '/registry',
  '/registries'
]

export const MONITORING_ROUTE_PREFIXES = ['/monitoring']
export const IPMGT_ROUTE_PREFIXES = ['/ipmgt']
export const PAM_ROUTE_PREFIXES = ['/pam']
export const WORK_ROUTE_PREFIXES = ['/work']

// The portal-admin area (Users, Audit, Admin > ...) - not an AppKey/module
// (it has no per-app permission tier), but the layout still treats it like
// one for the "Exit ..." header affordance. See useNav.ts's ADMIN_GROUPS.
export const ADMIN_ROUTE_PREFIXES = ['/admin', '/users', '/audit']

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

/** The app a given route belongs to, or null for portal pages (launcher, settings…). */
export function appKeyForRoute(path: string): AppKey | null {
  if (DOCKER_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'docker'
  if (MONITORING_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'monitoring'
  if (IPMGT_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'ipmgt'
  if (PAM_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'pam'
  if (WORK_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'work'
  return null
}

/** True for the portal-admin route subtree (Users, Audit, everything under /admin). */
export function isAdminRoute(path: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some((p) => matches(path, p))
}
