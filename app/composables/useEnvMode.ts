import { detectEnvModeFromHost, ENV_MODE_META, type EnvMode, type EnvModeSource } from '~~/shared/utils/envMode'

export interface EnvModeInfo {
  mode: EnvMode
  source: EnvModeSource
  locked: boolean
  label: string
  adminMode: EnvMode | ''
}

function defaults(): EnvModeInfo {
  return { mode: 'production', source: 'auto', locked: false, label: '', adminMode: '' }
}

/**
 * Deployment environment mode (production / staging / development / testing).
 * Resolved server-side (compose env var > admin setting > domain
 * auto-detection); every non-production mode carries a corner badge that
 * KNetraHubLogo overlays on the logo, and the favicon/PWA icons switch to
 * badged variants (see app.vue). Fetched once in app.vue like useAppearance,
 * so SSR renders the badge with no flash.
 */
export function useEnvMode() {
  const envMode = useState<EnvModeInfo>('env_mode_state', defaults)
  const loaded = useState<boolean>('env_mode_loaded', () => false)

  async function fetchEnvMode() {
    try {
      // SSR: the internal $fetch doesn't inherit the browser's Host header,
      // so domain auto-detection would always see production - forward the
      // real serving host to the API call.
      const headers = import.meta.server ? useRequestHeaders(['host', 'x-forwarded-host']) : undefined
      envMode.value = await $fetch<EnvModeInfo>('/api/settings/env-mode', { headers })
    } catch {
      // Server unreachable (static docs, DB warming up): fall back to pure
      // client-side domain detection so the badge still appears.
      if (import.meta.client) {
        const mode = detectEnvModeFromHost(location.hostname)
        envMode.value = { mode, source: 'auto', locked: false, label: ENV_MODE_META[mode].label, adminMode: '' }
      }
    } finally {
      loaded.value = true
    }
  }

  async function saveEnvMode(mode: EnvMode | '') {
    envMode.value = await $fetch<EnvModeInfo>('/api/settings/env-mode', { method: 'PUT', body: { mode } })
    return envMode.value
  }

  /** Whether a corner tag shows (non-production with a label). The ribbon
   *  color lives in appearance settings (envBadgeColor), so consumers combine
   *  this label with that color - see app/components/KNetraHubLogo.vue. */
  const badgeLabel = computed(() =>
    envMode.value.mode !== 'production' && envMode.value.label ? envMode.value.label : '')

  return { envMode, loaded, badgeLabel, fetchEnvMode, saveEnvMode }
}
