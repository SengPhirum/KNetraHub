/**
 * Deployment environment mode - shared between server (resolution, badged
 * icon rendering) and client (logo badge overlay, admin settings UI).
 *
 * Resolution order (server/utils/envModeState.ts):
 *   1. NUXT_ENV_MODE env var (docker-compose) - fixed, admin UI can't change it
 *   2. Admin override (Settings > Appearance > Environment mode)
 *   3. Auto-detection from the request domain (rules below)
 *
 * Every mode except production adds a corner tag ("Dev" / "Test" / "STG")
 * across the top-right of the app logo, favicon, and PWA icons.
 */

export type EnvMode = 'production' | 'staging' | 'development' | 'testing'
export type EnvModeSource = 'env' | 'admin' | 'auto'

export interface EnvModeMeta {
  /** Human name for pickers/status lines. */
  name: string
  /** Corner-tag text; empty = no badge (production). */
  label: string
}

export const ENV_MODES: EnvMode[] = ['production', 'staging', 'development', 'testing']

export const ENV_MODE_META: Record<EnvMode, EnvModeMeta> = {
  production: { name: 'Production', label: '' },
  staging: { name: 'Staging', label: 'STG' },
  development: { name: 'Development', label: 'Dev' },
  testing: { name: 'Testing', label: 'Test' }
}

/** Default environment-badge ribbon color when an admin hasn't picked one.
 *  A single color for every non-production mode (the mode is conveyed by the
 *  label text - Dev / Test / STG - not the color). Admin-overridable in
 *  Settings > Appearance. */
export const DEFAULT_ENV_BADGE_COLOR = '#DC2626'

/** Normalize a configured value (env var or stored admin choice) to a mode; '' when unset/unrecognized. */
export function normalizeEnvMode(input: unknown): EnvMode | '' {
  const s = String(input ?? '').trim().toLowerCase()
  if (!s) return ''
  if (['production', 'prod', 'prd'].includes(s)) return 'production'
  if (['staging', 'stg', 'sta'].includes(s)) return 'staging'
  if (['development', 'dev'].includes(s)) return 'development'
  if (['testing', 'test'].includes(s)) return 'testing'
  return ''
}

/**
 * Auto-detect a mode from the serving domain when nothing is configured:
 * "staging"/"stg"/"sta" anywhere in the host means staging,
 * "development"/"dev" means development, "testing"/"test" means testing,
 * anything else is production. Checked in that order.
 */
export function detectEnvModeFromHost(host: string): EnvMode {
  const h = String(host || '').toLowerCase()
  if (/staging|stg|sta/.test(h)) return 'staging'
  if (/development|dev/.test(h)) return 'development'
  if (/testing|test/.test(h)) return 'testing'
  return 'production'
}
