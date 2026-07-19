import { getRequestHost, type H3Event } from 'h3'
import { getAppSetting, setAppSetting, deleteAppSetting } from './store'
import { normalizeEnvMode, detectEnvModeFromHost, ENV_MODE_META, type EnvMode, type EnvModeSource } from '../../shared/utils/envMode'

/**
 * Resolves the deployment environment mode (see shared/utils/envMode.ts):
 * a NUXT_ENV_MODE env var (docker-compose) wins and locks the admin UI;
 * otherwise an admin-stored choice; otherwise auto-detection from the
 * request's Host header. Stored like every other admin setting - one value
 * in app_settings.
 */

const KEY = 'env_mode'

export interface ResolvedEnvMode {
  mode: EnvMode
  source: EnvModeSource
  /** True when fixed by NUXT_ENV_MODE - the admin UI must not offer changes. */
  locked: boolean
  label: string
  /** The stored admin choice ('' when none) - for the settings form only. */
  adminMode: EnvMode | ''
}

function shape(mode: EnvMode, source: EnvModeSource, locked: boolean, adminMode: EnvMode | ''): ResolvedEnvMode {
  return { mode, source, locked, label: ENV_MODE_META[mode].label, adminMode }
}

export async function getEnvModeState(event?: H3Event): Promise<ResolvedEnvMode> {
  const fixed = normalizeEnvMode((useRuntimeConfig().envMode as string) || '')
  if (fixed) return shape(fixed, 'env', true, '')

  const adminMode = normalizeEnvMode(await getAppSetting(KEY))
  if (adminMode) return shape(adminMode, 'admin', false, adminMode)

  const host = event ? getRequestHost(event, { xForwardedHost: true }) : ''
  return shape(detectEnvModeFromHost(host), 'auto', false, '')
}

/** Store ('' clears back to auto-detection). Callers must have checked `locked` first. */
export async function setAdminEnvMode(mode: EnvMode | '', actor: string): Promise<void> {
  if (mode) await setAppSetting(KEY, mode, actor)
  else await deleteAppSetting(KEY)
}
