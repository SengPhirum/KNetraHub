export interface UserPreferences {
  theme: 'system' | 'dark' | 'light'
  refreshInterval: number
  density: 'default' | 'compact' | 'comfortable'
}

const DEFAULT_PREFS: UserPreferences = { theme: 'system', refreshInterval: 0, density: 'default' }

export function usePreferences() {
  const prefs = useState<UserPreferences>('user_prefs', () => ({ ...DEFAULT_PREFS }))
  const colorMode = useColorMode()

  async function fetchPreferences() {
    try {
      const data = await $fetch<UserPreferences>('/api/user/preferences')
      prefs.value = data
      // Sync theme to Nuxt colorMode
      colorMode.preference = data.theme
    } catch {
      // not logged in yet or network error — use defaults
    }
  }

  async function updatePreferences(patch: Partial<UserPreferences>) {
    const data = await $fetch<UserPreferences>('/api/user/preferences', { method: 'PATCH', body: patch })
    prefs.value = data
    if (patch.theme !== undefined) colorMode.preference = patch.theme
    return data
  }

  return { prefs, fetchPreferences, updatePreferences }
}
