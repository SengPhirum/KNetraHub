import { requireRole } from '~~/server/utils/auth'
import { getLdapSettings, getLocalAuthSettings, getOidcSettings, hasAuthOverride } from '~~/server/utils/authSettings'
import { oidcRedirectUri } from '~~/server/utils/oidc'

/** Effective auth settings for the admin UI. Secrets are masked, never returned. */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const [local, ldap, oidc, localOverridden, ldapOverridden, oidcOverridden] = await Promise.all([
    getLocalAuthSettings(),
    getLdapSettings(),
    getOidcSettings(),
    hasAuthOverride('local'),
    hasAuthOverride('ldap'),
    hasAuthOverride('oidc')
  ])

  return {
    local: {
      ...local,
      enabled: true,
      overridden: localOverridden
    },
    ldap: {
      ...ldap,
      bindCredentials: '',
      hasBindCredentials: !!ldap.bindCredentials,
      overridden: ldapOverridden
    },
    oidc: {
      ...oidc,
      clientSecret: '',
      hasClientSecret: !!oidc.clientSecret,
      effectiveRedirectUri: oidcRedirectUri(event, oidc),
      overridden: oidcOverridden
    }
  }
})
