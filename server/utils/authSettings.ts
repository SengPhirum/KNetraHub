import { getAppSetting, setAppSetting, deleteAppSetting } from './store'

/**
 * Authentication provider settings.
 *
 * Environment variables (via runtimeConfig) provide the defaults; admins can
 * override them from the UI, in which case the full settings object is stored
 * as JSON in app_settings and wins over the environment. Deleting the row
 * falls back to the environment again.
 */

export interface LdapSettings {
  enabled: boolean
  url: string
  bindDN: string
  bindCredentials: string
  searchBase: string
  searchFilter: string
  groupSearchBase: string
  groupSearchFilter: string
  adminGroup: string
  operatorGroup: string
}

export interface OidcSettings {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  usernameClaim: string
  displayNameClaim: string
  groupsClaim: string
  adminGroup: string
  operatorGroup: string
  providerName: string
}

export type AuthProvider = 'ldap' | 'oidc'

const KEYS: Record<AuthProvider, string> = { ldap: 'auth.ldap', oidc: 'auth.oidc' }

function envLdap(): LdapSettings {
  const c = useRuntimeConfig().ldap
  return {
    enabled: c.enabled,
    url: c.url,
    bindDN: c.bindDN,
    bindCredentials: c.bindCredentials,
    searchBase: c.searchBase,
    searchFilter: c.searchFilter,
    groupSearchBase: c.groupSearchBase,
    groupSearchFilter: c.groupSearchFilter,
    adminGroup: c.adminGroup,
    operatorGroup: c.operatorGroup
  }
}

function envOidc(): OidcSettings {
  const c = useRuntimeConfig().oidc
  return {
    enabled: c.enabled,
    issuer: c.issuer,
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    redirectUri: c.redirectUri,
    scope: c.scope,
    usernameClaim: c.usernameClaim,
    displayNameClaim: c.displayNameClaim,
    groupsClaim: c.groupsClaim,
    adminGroup: c.adminGroup,
    operatorGroup: c.operatorGroup,
    providerName: c.providerName
  }
}

async function readOverrides<T>(provider: AuthProvider): Promise<Partial<T> | null> {
  const raw = await getAppSetting(KEYS[provider])
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<T>
  } catch {
    return null
  }
}

export async function getLdapSettings(): Promise<LdapSettings> {
  return { ...envLdap(), ...(await readOverrides<LdapSettings>('ldap')) }
}

export async function getOidcSettings(): Promise<OidcSettings> {
  return { ...envOidc(), ...(await readOverrides<OidcSettings>('oidc')) }
}

export async function hasAuthOverride(provider: AuthProvider): Promise<boolean> {
  return (await getAppSetting(KEYS[provider])) !== null
}

/** Persist a partial update; blank secrets keep their current value. */
export async function saveLdapSettings(patch: Partial<LdapSettings>, actor: string): Promise<LdapSettings> {
  const current = await getLdapSettings()
  const next = { ...current, ...patch }
  if (!patch.bindCredentials) next.bindCredentials = current.bindCredentials
  await setAppSetting(KEYS.ldap, JSON.stringify(next), actor)
  return next
}

export async function saveOidcSettings(patch: Partial<OidcSettings>, actor: string): Promise<OidcSettings> {
  const current = await getOidcSettings()
  const next = { ...current, ...patch }
  if (!patch.clientSecret) next.clientSecret = current.clientSecret
  await setAppSetting(KEYS.oidc, JSON.stringify(next), actor)
  return next
}

/** Drop the DB override so the provider follows the environment again. */
export async function resetAuthSettings(provider: AuthProvider): Promise<void> {
  await deleteAppSetting(KEYS[provider])
}
