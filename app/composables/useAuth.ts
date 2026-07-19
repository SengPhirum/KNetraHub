import type { AppKey, AppTier, AppEntitlements } from '../../shared/utils/entitlements'

interface SessionUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'manager' | 'operator' | 'viewer'
  source: 'local' | 'ldap' | 'oidc'
  /** Keycloak realm roles carried for reference/debugging (access uses `apps`). */
  realmRoles: string[]
  /** Resolved per-app access (tier per app, or null). Server is the source of truth. */
  apps: AppEntitlements
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth_user', () => null)

  async function fetchMe() {
    // During SSR, forward the incoming request cookies to the internal API
    // so a full-page load of a protected route sees the session.
    const request = import.meta.server ? useRequestFetch() : $fetch
    const { user: me } = await request<{ user: SessionUser | null }>('/api/auth/me')
    user.value = me
    return me
  }

  async function login(username: string, password: string) {
    const { user: me } = await $fetch<{ user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    user.value = me
    return me
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  const can = (min: 'viewer' | 'operator' | 'manager' | 'admin') => {
    const rank = { viewer: 1, operator: 2, manager: 3, admin: 4 }
    if (!user.value) return false
    return rank[user.value.role] >= rank[min]
  }

  /** The user's tier for a given app, or null if they have no access. */
  const appTier = (app: AppKey): AppTier | null => user.value?.apps?.[app] ?? null

  /** Does the user have access to an app, at least at `min` tier (default viewer)? */
  const hasApp = (app: AppKey, min: AppTier = 'viewer') => tierAtLeast(appTier(app), min)

  /** Apps the user can see, in registry order - used by the launcher and nav. */
  const { isEnabled } = useModules()
  const accessibleApps = computed(() => getModuleRegistry().filter((m) => isEnabled(m.key) && hasApp(m.key as AppKey)))

  /**
   * Fine-grained permission check, for menu visibility/UX only (every API
   * re-checks server-side). App-scoped permissions resolve against the per-app
   * tier; portal/admin permissions fall back to the global role.
   */
  const hasPermission = (permission: Permission) => {
    if (!user.value) return false
    const app = appForPermission(permission)
    if (app) return tierGrantsPermission(app, appTier(app), permission)
    return roleHasPermission(user.value.role, permission)
  }

  return { user, fetchMe, login, logout, can, hasPermission, hasApp, appTier, accessibleApps }
}
