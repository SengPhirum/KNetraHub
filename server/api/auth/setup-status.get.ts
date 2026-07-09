import { adminExists } from '~~/server/utils/store'
import { getLdapSettings, getOidcSettings } from '~~/server/utils/authSettings'

/** Unauthenticated: tells the app whether the first-run setup wizard should
 *  run. Only applies to the local-account flow - if SSO is configured, admin
 *  access is governed by the identity provider's role mapping instead, so the
 *  wizard would just be in the way. */
export default defineEventHandler(async () => {
  const [hasAdmin, ldap, oidc] = await Promise.all([
    adminExists(),
    getLdapSettings(),
    getOidcSettings()
  ])
  const required = !hasAdmin && !ldap.enabled && !oidc.enabled
  return { required }
})
