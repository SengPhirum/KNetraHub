import { requireRole } from '~~/server/utils/auth'
import { saveLdapSettings, saveLocalAuthSettings, saveOidcSettings } from '~~/server/utils/authSettings'
import type { LdapSettings, LocalAuthSettings, OidcSettings } from '~~/server/utils/authSettings'
import { audit } from '~~/server/utils/store'

const LDAP_FIELDS: (keyof LdapSettings)[] = [
  'enabled', 'url', 'bindDN', 'bindCredentials', 'searchBase', 'searchFilter',
  'groupSearchBase', 'groupSearchFilter', 'adminGroup', 'operatorGroup'
]
const LOCAL_FIELDS: (keyof LocalAuthSettings)[] = [
  'hideLogin', 'sessionTimeoutMinutes', 'passwordMinLength',
  'passwordRequireUppercase', 'passwordRequireLowercase',
  'passwordRequireNumber', 'passwordRequireSpecial'
]
const OIDC_FIELDS: (keyof OidcSettings)[] = [
  'enabled', 'issuer', 'clientId', 'clientSecret', 'redirectUri', 'scope',
  'usernameClaim', 'displayNameClaim', 'groupsClaim', 'rolesClaim', 'adminGroup', 'operatorGroup', 'providerName'
]

// Only known fields are accepted; booleans and numbers retain their type.
function pick<T>(input: Record<string, unknown>, fields: (keyof T)[]): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = input[f as string]
    if (v === undefined) continue
    out[f as string] = typeof v === 'boolean' || typeof v === 'number' ? v : String(v).trim()
  }
  return out as Partial<T>
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<{ provider?: string, settings?: Record<string, unknown> }>(event)

  if (!body?.settings || !['local', 'ldap', 'oidc'].includes(String(body.provider))) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { provider: "local" | "ldap" | "oidc", settings: {...} }' })
  }

  if (body.provider === 'local') {
    const patch = pick<LocalAuthSettings>(body.settings, LOCAL_FIELDS)
    for (const field of ['hideLogin', 'passwordRequireUppercase', 'passwordRequireLowercase', 'passwordRequireNumber', 'passwordRequireSpecial'] as const) {
      if (field in patch && typeof patch[field] !== 'boolean') {
        throw createError({ statusCode: 400, statusMessage: `"${field}" must be a boolean` })
      }
    }
    if ('sessionTimeoutMinutes' in patch) {
      const sessionMinutes = Number(patch.sessionTimeoutMinutes)
      if (!Number.isInteger(sessionMinutes) || sessionMinutes < 5 || sessionMinutes > 43_200) {
        throw createError({ statusCode: 400, statusMessage: 'Session timeout must be between 5 and 43,200 minutes' })
      }
    }
    if ('passwordMinLength' in patch) {
      const minLength = Number(patch.passwordMinLength)
      if (!Number.isInteger(minLength) || minLength < 8 || minLength > 128) {
        throw createError({ statusCode: 400, statusMessage: 'Minimum password length must be between 8 and 128 characters' })
      }
    }
    await saveLocalAuthSettings(patch, user.username)
  } else if (body.provider === 'ldap') {
    const patch = pick<LdapSettings>(body.settings, LDAP_FIELDS)
    if (typeof patch.enabled !== 'undefined' && typeof patch.enabled !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: '"enabled" must be a boolean' })
    }
    await saveLdapSettings(patch, user.username)
  } else {
    const patch = pick<OidcSettings>(body.settings, OIDC_FIELDS)
    if (typeof patch.enabled !== 'undefined' && typeof patch.enabled !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: '"enabled" must be a boolean' })
    }
    if (patch.enabled && 'issuer' in patch && !patch.issuer) {
      throw createError({ statusCode: 400, statusMessage: 'Issuer is required when OIDC is enabled' })
    }
    await saveOidcSettings(patch, user.username)
  }

  await audit({ actor: user.username, action: 'settings.auth.update', target: body.provider })
  return { ok: true }
})
