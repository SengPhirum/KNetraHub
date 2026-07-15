export interface AppearanceSettings {
  appName: string
  primaryColor: string
  logoHorizontalUrl: string
  logoIconUrl: string
  faviconUrl: string
  pwaIconUrl: string
}

export const DEFAULT_PRIMARY_COLOR = '#2496ED'

function defaults(): AppearanceSettings {
  return {
    appName: useRuntimeConfig().public.appName || 'KNetraHub',
    primaryColor: DEFAULT_PRIMARY_COLOR,
    logoHorizontalUrl: '',
    logoIconUrl: '',
    faviconUrl: '',
    pwaIconUrl: ''
  }
}

/**
 * Global, app-wide branding (not per-user, unlike usePreferences). Fetched
 * once in app.vue so SSR renders the right colors/logo immediately - no
 * flash of default branding before hydration.
 */
export function useAppearance() {
  const appearance = useState<AppearanceSettings>('appearance_settings', defaults)
  const overridden = useState<boolean>('appearance_overridden', () => false)
  const loaded = useState<boolean>('appearance_loaded', () => false)

  async function fetchAppearance() {
    try {
      const data = await $fetch<AppearanceSettings & { overridden: boolean }>('/api/settings/appearance')
      const { overridden: isOverridden, ...settings } = data
      appearance.value = settings
      overridden.value = isOverridden
    } catch {
      // not reachable yet (e.g. DB warming up) - keep defaults
    } finally {
      loaded.value = true
    }
  }

  /** Mutate the shared state directly for instant live-preview while editing, without persisting. */
  function previewAppearance(patch: Partial<AppearanceSettings>) {
    appearance.value = { ...appearance.value, ...patch }
  }

  async function saveAppearance(patch: Partial<AppearanceSettings>) {
    const data = await $fetch<AppearanceSettings & { overridden: boolean }>('/api/settings/appearance', { method: 'PUT', body: patch })
    appearance.value = {
      appName: data.appName,
      primaryColor: data.primaryColor,
      logoHorizontalUrl: data.logoHorizontalUrl,
      logoIconUrl: data.logoIconUrl,
      faviconUrl: data.faviconUrl,
      pwaIconUrl: data.pwaIconUrl
    }
    overridden.value = true
    return data
  }

  async function resetAppearance() {
    await $fetch('/api/settings/appearance', { method: 'DELETE' })
    overridden.value = false
    await fetchAppearance()
  }

  /** CSS custom properties to set as inline style on <html> - wins over any stylesheet rule, SSR-safe, no flash. */
  const htmlStyle = computed(() => {
    const scale = generateColorScale(appearance.value.primaryColor)
    const vars: Record<string, string> = {
      '--ui-primary': appearance.value.primaryColor,
      '--color-beacon': appearance.value.primaryColor,
      '--color-depth': scale['400']
    }
    for (const [step, hex] of Object.entries(scale)) vars[`--ui-color-primary-${step}`] = hex
    return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ')
  })

  return { appearance, overridden, loaded, fetchAppearance, previewAppearance, saveAppearance, resetAppearance, htmlStyle }
}
