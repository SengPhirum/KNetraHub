import { getAppSetting, setAppSetting, deleteAppSetting } from './store'

/**
 * Appearance / branding settings - app name, primary color, and logo
 * overrides. Same pattern as authSettings.ts: defaults come from runtime
 * config / built-in assets, admins can override from the UI, and the
 * override is stored as one JSON blob in app_settings. Unlike auth settings,
 * this is read by unauthenticated visitors too (the login screen needs the
 * branding before anyone signs in), so there is no secret data here.
 */

export interface AppearanceSettings {
  appName: string
  /** Hex color, e.g. #2496ED. Drives --ui-primary and the app's accent color. */
  primaryColor: string
  /** Empty string means "use the built-in KNetraHub wordmark". */
  logoHorizontalUrl: string
  /** Empty string means "use the built-in KNetraHub icon". */
  logoIconUrl: string
  /** Empty string means "use the built-in KNetraHub favicon". Browser tab icon. */
  faviconUrl: string
  /** Empty string means "use the built-in KNetraHub app icon". Drives the PWA manifest icons and the Apple touch icon. */
  pwaIconUrl: string
}

const KEY = 'appearance'

export const DEFAULT_PRIMARY_COLOR = '#2496ED'

/** Config/built-in defaults only - no DB read. Exported so the static docs
 *  build can serve appearance without ever touching Postgres. */
export function defaultAppearanceSettings(): AppearanceSettings {
  return {
    appName: useRuntimeConfig().public.appName || 'KNetraHub',
    primaryColor: DEFAULT_PRIMARY_COLOR,
    logoHorizontalUrl: '',
    logoIconUrl: '',
    faviconUrl: '',
    pwaIconUrl: ''
  }
}

async function readOverrides(): Promise<Partial<AppearanceSettings> | null> {
  const raw = await getAppSetting(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<AppearanceSettings>
  } catch {
    return null
  }
}

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  return { ...defaultAppearanceSettings(), ...(await readOverrides()) }
}

export async function hasAppearanceOverride(): Promise<boolean> {
  return (await getAppSetting(KEY)) !== null
}

export async function saveAppearanceSettings(patch: Partial<AppearanceSettings>, actor: string): Promise<AppearanceSettings> {
  const current = await getAppearanceSettings()
  const next = { ...current, ...patch }
  await setAppSetting(KEY, JSON.stringify(next), actor)
  return next
}

export async function resetAppearanceSettings(): Promise<void> {
  await deleteAppSetting(KEY)
}
