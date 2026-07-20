import { requireApp } from '~~/server/utils/auth'
import { listUsers } from '~~/server/utils/store'
import { getAppRoleMap } from '~~/server/utils/appRoles'
import { resolveEntitlements, APP_KEYS, type AppKey } from '~~/shared/utils/entitlements'

/**
 * Read-only listing of the users who can reach a given sub-app, with the tier
 * (role) they have in it. Powers each app's Administration > Users page.
 *
 * Access is gated to managers and admins *of that app* (requireApp ... 'manager')
 * - a manager can review who has access without being a portal admin. The
 * per-user tier is resolved exactly as the runtime does it: local admins are
 * the superuser (admin everywhere), other local users from their assigned
 * app_access, and SSO/LDAP users from their realm roles against the app-role
 * map (see shared/utils/entitlements.ts).
 *
 * Server-side paginated so a large directory doesn't ship in one payload.
 */
export default defineEventHandler(async (event) => {
  const app = String(getQuery(event).app || '') as AppKey
  if (!(APP_KEYS as string[]).includes(app)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown app: ${app}` })
  }
  await requireApp(event, app, 'manager')

  const q = getQuery(event)
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20))

  const [users, roleMap] = await Promise.all([listUsers(), getAppRoleMap()])

  const withAccess = users
    .map((u) => {
      const tier = resolveEntitlements(u, u.realmRoles || [], roleMap)[app]
      return tier ? { id: u.id, name: u.displayName || u.username, username: u.username, source: u.source, tier } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const total = withAccess.length
  const start = (page - 1) * pageSize
  return {
    rows: withAccess.slice(start, start + pageSize),
    total,
    page,
    pageSize
  }
})
