import { requireRole } from '~~/server/utils/auth'
import { getLdapSettings, getOidcSettings, hasAuthOverride } from '~~/server/utils/authSettings'
import { oidcRedirectUri } from '~~/server/utils/oidc'

/** Effective auth settings for the admin UI. Secrets are masked, never returned. */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const [ldap, oidc, ldapOverridden, oidcOverridden] = await Promise.all([
    getLdapSettings(),
    getOidcSettings(),
    hasAuthOverride('ldap'),
    hasAuthOverride('oidc')
  ])

  return {
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
