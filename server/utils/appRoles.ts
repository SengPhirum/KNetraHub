import { getAppSetting, setAppSetting } from './store'
import {
  APP_KEYS,
  emptyAppRoleMap,
  type AppRoleMap,
  type AppTier
} from '../../shared/utils/entitlements'

/**
 * App → realm-role mapping (which Keycloak realm roles grant which tier of
 * which app). Configured from Settings → Apps & Access, stored as one JSON
 * blob in app_settings (same pattern as appearanceSettings.ts). Defaults to
 * an empty map, meaning external users get no apps until an admin configures
 * it - the local admin superuser is unaffected (see resolveEntitlements).
 */
const KEY = 'app_role_map'

const TIERS: AppTier[] = ['viewer', 'operator', 'manager', 'admin']

/**
 * The old `net` (Network) and `server` (Server) apps were merged into one
 * `monitoring` app. Fold any legacy stored/posted role lists for those keys into
 * `monitoring` (union per tier) so admins don't lose their identity-provider →
 * access mapping across the merge. Idempotent: once `monitoring` is persisted,
 * the legacy keys are gone and this is a no-op. Non-mutating (returns a copy).
 */
function foldLegacyMonitoring(obj: Record<string, any>): Record<string, any> {
  const legacy = [obj.net, obj.server].filter((v) => v && typeof v === 'object')
  if (legacy.length === 0) return obj
  const out = { ...obj }
  const monitoring: Record<string, string[]> = { ...(out.monitoring && typeof out.monitoring === 'object' ? out.monitoring : {}) }
  for (const tier of TIERS) {
    const merged = new Set<string>()
    for (const src of [monitoring[tier], ...legacy.map((l) => l[tier])]) {
      if (Array.isArray(src)) for (const r of src) merged.add(String(r).trim())
    }
    monitoring[tier] = [...merged].filter(Boolean)
  }
  out.monitoring = monitoring
  delete out.net
  delete out.server
  return out
}

/** Coerce arbitrary stored/posted JSON into a well-formed AppRoleMap. */
export function sanitizeAppRoleMap(input: unknown): AppRoleMap {
  const map = emptyAppRoleMap()
  if (!input || typeof input !== 'object') return map
  const obj = foldLegacyMonitoring(input as Record<string, any>)
  for (const app of APP_KEYS) {
    const appCfg = obj[app]
    if (!appCfg || typeof appCfg !== 'object') continue
    for (const tier of TIERS) {
      const roles = appCfg[tier]
      if (!Array.isArray(roles)) continue
      map[app][tier] = [...new Set(
        roles
          .map((r) => String(r).trim())
          .filter(Boolean)
      )]
    }
  }
  return map
}

// The role map is read on every app-scoped API request (appAccess middleware),
// so cache it briefly to avoid a DB round-trip per request. A few seconds of
// staleness after an admin edits the map is acceptable.
const CACHE_TTL_MS = 5000
let cache: { map: AppRoleMap; at: number } | null = null

export async function getAppRoleMap(): Promise<AppRoleMap> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map
  const raw = await getAppSetting(KEY)
  const map = raw ? safeParse(raw) : emptyAppRoleMap()
  cache = { map, at: Date.now() }
  return map
}

function safeParse(raw: string): AppRoleMap {
  try {
    return sanitizeAppRoleMap(JSON.parse(raw))
  } catch {
    return emptyAppRoleMap()
  }
}

export async function setAppRoleMap(input: unknown, actor: string): Promise<AppRoleMap> {
  const map = sanitizeAppRoleMap(input)
  await setAppSetting(KEY, JSON.stringify(map), actor)
  cache = { map, at: Date.now() }
  return map
}
