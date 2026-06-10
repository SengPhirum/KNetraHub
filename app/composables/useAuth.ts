interface SessionUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'operator' | 'viewer'
  source: 'local' | 'ldap' | 'oidc'
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

  const can = (min: 'viewer' | 'operator' | 'admin') => {
    const rank = { viewer: 1, operator: 2, admin: 3 }
    if (!user.value) return false
    return rank[user.value.role] >= rank[min]
  }

  return { user, fetchMe, login, logout, can }
}
