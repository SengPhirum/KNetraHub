export interface NotificationPreferences {
  delivery: 'browser' | 'toast'
  criticalAlerts: boolean
  warningAlerts: boolean
  infoAlerts: boolean
  actionStarted: boolean
  actionSucceeded: boolean
  actionFailed: boolean
  newLogin: boolean
}

export interface DashboardGridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface UserPreferences {
  theme: 'system' | 'dark' | 'light'
  refreshInterval: number
  density: 'default' | 'compact' | 'comfortable'
  lists: Record<string, { sortBy: string; sortDir: 'asc' | 'desc'; filters?: Record<string, string[]> }>
  notifications: NotificationPreferences
  /** Saved drag/resize grid layouts for customizable dashboards, keyed by an
   *  app-chosen dashboard id (e.g. "docker"). */
  dashboards: Record<string, DashboardGridItem[]>
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  delivery: 'browser',
  criticalAlerts: true,
  warningAlerts: false,
  infoAlerts: false,
  actionStarted: false,
  actionSucceeded: false,
  actionFailed: false,
  newLogin: false
}

const DEFAULT_PREFS: UserPreferences = { theme: 'system', refreshInterval: 0, density: 'default', lists: {}, notifications: { ...DEFAULT_NOTIFICATIONS }, dashboards: {} }

export function usePreferences() {
  const prefs = useState<UserPreferences>('user_prefs', () => ({ ...DEFAULT_PREFS }))
  const colorMode = useColorMode()

  async function fetchPreferences() {
    try {
      const data = await $fetch<UserPreferences>('/api/user/preferences')
      prefs.value = { ...DEFAULT_PREFS, ...data, lists: data.lists || {}, notifications: { ...DEFAULT_NOTIFICATIONS, ...data.notifications }, dashboards: data.dashboards || {} }
      // Sync theme to Nuxt colorMode
      colorMode.preference = data.theme
    } catch {
      // not logged in yet or network error — use defaults
    }
  }

  async function updatePreferences(patch: Partial<UserPreferences>) {
    const data = await $fetch<UserPreferences>('/api/user/preferences', { method: 'PATCH', body: patch })
    prefs.value = { ...DEFAULT_PREFS, ...data, lists: data.lists || {}, notifications: { ...DEFAULT_NOTIFICATIONS, ...data.notifications }, dashboards: data.dashboards || {} }
    if (patch.theme !== undefined) colorMode.preference = patch.theme
    return data
  }

  return { prefs, fetchPreferences, updatePreferences }
}
