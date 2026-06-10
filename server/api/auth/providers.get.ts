import { getLdapSettings, getOidcSettings } from '~~/server/utils/authSettings'

/** Unauthenticated: tells the login page which providers to offer. */
export default defineEventHandler(async () => {
  const [ldap, oidc] = await Promise.all([getLdapSettings(), getOidcSettings()])
  return {
    ldapEnabled: ldap.enabled,
    oidcEnabled: oidc.enabled,
    oidcProviderName: oidc.providerName
  }
})
