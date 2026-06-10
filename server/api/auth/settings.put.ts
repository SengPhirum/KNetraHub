import { requireRole } from '~~/server/utils/auth'
import { saveLdapSettings, saveOidcSettings } from '~~/server/utils/authSettings'
import type { LdapSettings, OidcSettings } from '~~/server/utils/authSettings'
import { audit } from '~~/server/utils/store'

const LDAP_FIELDS: (keyof LdapSettings)[] = [
  'enabled', 'url', 'bindDN', 'bindCredentials', 'searchBase', 'searchFilter',
  'groupSearchBase', 'groupSearchFilter', 'adminGroup', 'operatorGroup'
]
const OIDC_FIELDS: (keyof OidcSettings)[] = [
  'enabled', 'issuer', 'clientId', 'clientSecret', 'redirectUri', 'scope',
  'usernameClaim', 'displayNameClaim', 'groupsClaim', 'adminGroup', 'operatorGroup', 'providerName'
]

// Only known fields are accepted; booleans stay booleans, everything else is a string.
function pick<T>(input: Record<string, unknown>, fields: (keyof T)[]): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = input[f as string]
    if (v === undefined) continue
    out[f as string] = typeof v === 'boolean' ? v : String(v).trim()
  }
  return out as Partial<T>
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<{ provider?: string, settings?: Record<string, unknown> }>(event)

  if (!body?.settings || (body.provider !== 'ldap' && body.provider !== 'oidc')) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { provider: "ldap" | "oidc", settings: {...} }' })
  }

  if (body.provider === 'ldap') {
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
