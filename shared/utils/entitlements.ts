import type { Role, UserSource } from '../../server/utils/store'
import {
  APP_PERMISSIONS,
  cumulativeAppPermissions,
  type Permission
} from './permissions'

/**
 * Per-app access model (KNetraHub portal). Each app the user can reach is
 * granted at a tier; the tier maps to that app's cumulative permissions
 * (see shared/utils/permissions.ts). Which realm roles grant which tier is
 * configured in Settings and stored in the DB (server/utils/appRoles.ts).
 */
export type AppKey = keyof typeof APP_PERMISSIONS // 'docker' | 'monitoring' | 'ipmgt'
export type AppTier = 'viewer' | 'operator' | 'manager' | 'admin'

export const APP_KEYS = Object.keys(APP_PERMISSIONS) as AppKey[]

/** App → tier → list of Keycloak realm-role names that grant that tier. */
export type AppRoleMap = Record<AppKey, Record<AppTier, string[]>>

/** Resolved entitlements: the granted tier per app, or null if no access. */
export type AppEntitlements = Record<AppKey, AppTier | null>

const TIER_RANK: Record<AppTier, number> = { viewer: 1, operator: 2, manager: 3, admin: 4 }
const TIERS: AppTier[] = ['admin', 'manager', 'operator', 'viewer'] // highest first

export function tierAtLeast(have: AppTier | null, min: AppTier): boolean {
  return have != null && TIER_RANK[have] >= TIER_RANK[min]
}

export function emptyAppRoleMap(): AppRoleMap {
  return APP_KEYS.reduce((acc, app) => {
    acc[app] = { viewer: [], operator: [], manager: [], admin: [] }
    return acc
  }, {} as AppRoleMap)
}

function emptyEntitlements(): AppEntitlements {
  return APP_KEYS.reduce((acc, app) => {
    acc[app] = null
    return acc
  }, {} as AppEntitlements)
}

function superuserEntitlements(): AppEntitlements {
  return APP_KEYS.reduce((acc, app) => {
    acc[app] = 'admin'
    return acc
  }, {} as AppEntitlements)
}

/**
 * Resolve which apps a user can reach and at what tier.
 *
 * - Local admin is the break-glass superuser → every app at admin tier.
 * - Other local users get no apps (day-to-day access is via Keycloak).
 * - External (oidc/ldap) users: per app, the highest tier whose configured
 *   realm-role list intersects the user's realm roles.
 */
export function resolveEntitlements(
  user: { role: Role; source: UserSource },
  realmRoles: string[],
  roleMap: AppRoleMap
): AppEntitlements {
  if (user.source === 'local') {
    return user.role === 'admin' ? superuserEntitlements() : emptyEntitlements()
  }

  const roles = new Set(realmRoles.map((r) => normalizeRealmRole(r)))
  const result = emptyEntitlements()
  for (const app of APP_KEYS) {
    const tiers = roleMap[app]
    if (!tiers) continue
    for (const tier of TIERS) {
      if ((tiers[tier] || []).some((r) => roles.has(normalizeRealmRole(r)))) {
        result[app] = tier
        break // TIERS is highest-first, so first match wins
      }
    }
  }
  return result
}

/** Does a granted app tier include a specific permission? */
export function tierGrantsPermission(app: AppKey, tier: AppTier | null, perm: Permission): boolean {
  if (!tier) return false
  return cumulativeAppPermissions(app, tier).includes(perm)
}

/** Which app owns a permission like "docker.manage" → "docker". */
export function appForPermission(perm: Permission): AppKey | null {
  const key = perm.split('.')[0] ?? ''
  return (APP_KEYS as string[]).includes(key) ? (key as AppKey) : null
}

// Keycloak often emits roles with a leading slash or as full paths; compare
// case-insensitively on the trailing segment so "/dock-ops" === "dock-ops".
function normalizeRealmRole(r: string): string {
  return String(r).trim().toLowerCase().replace(/^\//, '')
}
