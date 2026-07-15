import { getAppSetting, setAppSetting, deleteAppSetting } from './store'
import { encryptSecret, decryptSecret } from './secretCrypto'
import type { PasswordPolicy } from '../../shared/utils/passwordPolicy'

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
  managerGroup: string
  operatorGroup: string
}

export interface LocalAuthSettings extends PasswordPolicy {
  /** Local authentication is permanent recovery access and cannot be disabled. */
  enabled: true
  hideLogin: boolean
  /** Absolute lifetime of newly issued browser sessions. */
  sessionTimeoutMinutes: number
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
  /** Claim holding Keycloak realm roles, used for per-app access. */
  rolesClaim: string
  adminGroup: string
  managerGroup: string
  operatorGroup: string
  providerName: string
  /** Icon shown on the login page's "Continue with ..." button. Empty string
   *  means "use the built-in key icon". Stored inline as a base64 data URI
   *  (or an http(s) URL), same as the appearance logos in appearanceSettings.ts. */
  iconUrl: string
}

export type AuthProvider = 'local' | 'ldap' | 'oidc'

const KEYS: Record<AuthProvider, string> = { local: 'auth.local', ldap: 'auth.ldap', oidc: 'auth.oidc' }

function envLocal(): LocalAuthSettings {
  const c = useRuntimeConfig().localAuth
  return normalizeLocalSettings({
    enabled: true,
    hideLogin: c.hideLogin,
    sessionTimeoutMinutes: c.sessionTimeoutMinutes,
    passwordMinLength: c.passwordMinLength,
    passwordRequireUppercase: c.passwordRequireUppercase,
    passwordRequireLowercase: c.passwordRequireLowercase,
    passwordRequireNumber: c.passwordRequireNumber,
    passwordRequireSpecial: c.passwordRequireSpecial
  })
}

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
    managerGroup: c.managerGroup,
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
    rolesClaim: c.rolesClaim,
    adminGroup: c.adminGroup,
    managerGroup: c.managerGroup,
    operatorGroup: c.operatorGroup,
    providerName: c.providerName,
    iconUrl: c.iconUrl
  }
}

// Which field holds the secret for each provider - decrypted on read (only
// the DB override, never the env-sourced plaintext defaults) and encrypted
// on write, right at the storage boundary.
const SECRET_FIELD: Partial<Record<AuthProvider, 'bindCredentials' | 'clientSecret'>> = {
  ldap: 'bindCredentials',
  oidc: 'clientSecret'
}

async function readOverrides<T>(provider: AuthProvider): Promise<Partial<T> | null> {
  const raw = await getAppSetting(KEYS[provider])
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const secretField = SECRET_FIELD[provider]
    if (secretField && typeof parsed[secretField] === 'string') {
      parsed[secretField] = decryptSecret(parsed[secretField] as string)
    }
    return parsed as Partial<T>
  } catch {
    return null
  }
}

export async function getLocalAuthSettings(): Promise<LocalAuthSettings> {
  return normalizeLocalSettings({ ...envLocal(), ...(await readOverrides<LocalAuthSettings>('local')), enabled: true })
}

export async function getLdapSettings(): Promise<LdapSettings> {
  return { ...envLdap(), ...(await readOverrides<LdapSettings>('ldap')) }
}

export async function getOidcSettings(): Promise<OidcSettings> {
  return { ...envOidc(), ...(await readOverrides<OidcSettings>('oidc')) }
}

export async function saveLocalAuthSettings(patch: Partial<LocalAuthSettings>, actor: string): Promise<LocalAuthSettings> {
  const current = await getLocalAuthSettings()
  const next = normalizeLocalSettings({ ...current, ...patch, enabled: true })
  await setAppSetting(KEYS.local, JSON.stringify(next), actor)
  return next
}

export async function hasAuthOverride(provider: AuthProvider): Promise<boolean> {
  return (await getAppSetting(KEYS[provider])) !== null
}

/** Persist a partial update; blank secrets keep their current value. */
export async function saveLdapSettings(patch: Partial<LdapSettings>, actor: string): Promise<LdapSettings> {
  const current = await getLdapSettings()
  const next = { ...current, ...patch }
  if (!patch.bindCredentials) next.bindCredentials = current.bindCredentials
  const stored = { ...next, bindCredentials: next.bindCredentials ? encryptSecret(next.bindCredentials) : '' }
  await setAppSetting(KEYS.ldap, JSON.stringify(stored), actor)
  return next
}

export async function saveOidcSettings(patch: Partial<OidcSettings>, actor: string): Promise<OidcSettings> {
  const current = await getOidcSettings()
  const next = { ...current, ...patch }
  if (!patch.clientSecret) next.clientSecret = current.clientSecret
  const stored = { ...next, clientSecret: next.clientSecret ? encryptSecret(next.clientSecret) : '' }
  await setAppSetting(KEYS.oidc, JSON.stringify(stored), actor)
  return next
}

/** Drop the DB override so the provider follows the environment again. */
export async function resetAuthSettings(provider: AuthProvider): Promise<void> {
  await deleteAppSetting(KEYS[provider])
}

function normalizeLocalSettings(input: LocalAuthSettings): LocalAuthSettings {
  const sessionTimeoutMinutes = finiteInteger(input.sessionTimeoutMinutes, 720, 5, 43_200)
  const passwordMinLength = finiteInteger(input.passwordMinLength, 8, 8, 128)
  return {
    enabled: true,
    hideLogin: input.hideLogin === true,
    sessionTimeoutMinutes,
    passwordMinLength,
    passwordRequireUppercase: input.passwordRequireUppercase === true,
    passwordRequireLowercase: input.passwordRequireLowercase === true,
    passwordRequireNumber: input.passwordRequireNumber === true,
    passwordRequireSpecial: input.passwordRequireSpecial === true
  }
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
