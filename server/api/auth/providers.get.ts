import { getLdapSettings, getLocalAuthSettings, getOidcSettings } from '~~/server/utils/authSettings'

/** Unauthenticated: tells the login page which providers to offer. */
export default defineEventHandler(async () => {
  const [local, ldap, oidc] = await Promise.all([getLocalAuthSettings(), getLdapSettings(), getOidcSettings()])
  return {
    localEnabled: true,
    localLoginHidden: local.hideLogin,
    ldapEnabled: ldap.enabled,
    oidcEnabled: oidc.enabled,
    oidcProviderName: oidc.providerName
  }
})
