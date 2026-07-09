import { requireRole } from '~~/server/utils/auth'
import { listUsers, type Role } from '~~/server/utils/store'
import { getAppRoleMap } from '~~/server/utils/appRoles'
import { resolveEntitlements, APP_KEYS, type AppEntitlements } from '../../../shared/utils/entitlements'
import { cumulativeAppPermissions } from '../../../shared/utils/permissions'

export interface UserAuthorityRow {
  id: string
  username: string
  displayName: string
  email?: string
  role: Role
  source: string
  createdAt: string
  lastLogin?: string
  realmRoles: string[]
  apps: AppEntitlements
  /** Cumulative permission strings per app, for the export - avoids making
   *  the export recompute the tier->permission mapping itself. */
  appPermissions: Record<string, string[]>
}

// Manager+ only: a point-in-time snapshot of who can do what, across the
// global role and every sub-app's tier. Realm roles (and therefore per-app
// tier) for external users are resolved from their *last login* snapshot
// (users.realm_roles), not a live directory lookup - see User.realmRoles.
export default defineEventHandler(async (event): Promise<UserAuthorityRow[]> => {
  await requireRole(event, 'manager')

  const [users, roleMap] = await Promise.all([listUsers(), getAppRoleMap()])

  return users.map((u): UserAuthorityRow => {
    const realmRoles = u.realmRoles || []
    const apps = resolveEntitlements({ role: u.role, source: u.source, appAccess: u.appAccess }, realmRoles, roleMap)
    const appPermissions: Record<string, string[]> = {}
    for (const app of APP_KEYS) {
      const tier = apps[app]
      appPermissions[app] = tier ? cumulativeAppPermissions(app, tier) : []
    }
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      source: u.source,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
      realmRoles,
      apps,
      appPermissions
    }
  })
})
