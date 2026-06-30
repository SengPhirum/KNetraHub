import type { AppKey } from '../../shared/utils/entitlements'

/**
 * Which page routes belong to which app. The "Dock" app keeps the original
 * Docker Swarm page paths (no mass URL rewrite); its dashboard lives at /dock.
 * Network/Server/IP Management are now in-process SPA modules, each owning a
 * route subtree under /net, /server and /ipmgt respectively. Used by the
 * contextual sidebar (useNav) and the client access guard (route-access).
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

export const NET_ROUTE_PREFIXES = ['/net']
export const SERVER_ROUTE_PREFIXES = ['/server']
export const IPMGT_ROUTE_PREFIXES = ['/ipmgt']

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

/** The app a given route belongs to, or null for portal pages (launcher, settings…). */
export function appKeyForRoute(path: string): AppKey | null {
  if (DOCKER_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'docker'
  if (NET_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'net'
  if (SERVER_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'server'
  if (IPMGT_ROUTE_PREFIXES.some((p) => matches(path, p))) return 'ipmgt'
  return null
}
