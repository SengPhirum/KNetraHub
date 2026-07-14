import { requireRole } from '~~/server/utils/auth'
import { getOidcSettings } from '~~/server/utils/authSettings'
import { discoverOidcIssuer } from '~~/server/utils/oidc'
import { audit } from '~~/server/utils/store'

/**
 * "Test & Query" for the OIDC settings form: live-fetches the provider's
 * `.well-known/openid-configuration` document for the (possibly unsaved)
 * issuer URL and reports what it found. This validates issuer reachability
 * and discovery-document shape. The UI can then launch the separate popup
 * login test, which performs the real authorization-code flow against saved
 * settings without replacing the admin's current session.
 *
 * Accepts issuer/clientId overrides so an admin can test values they've
 * typed but not yet saved; blank fields fall back to the currently stored
 * configuration, matching the same "blank = keep current" convention used
 * when saving.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<{ issuer?: string, clientId?: string }>(event).catch(() => ({}))
  const stored = await getOidcSettings()

  const issuer = String(body?.issuer || stored.issuer || '').trim()
  const clientId = String(body?.clientId || stored.clientId || '').trim()

  if (!issuer) throw createError({ statusCode: 400, statusMessage: 'Enter an issuer URL to test' })
  if (!/^https?:\/\/.+/i.test(issuer)) throw createError({ statusCode: 400, statusMessage: 'Issuer must be a full URL, e.g. https://idp.example.com/realms/main' })
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Enter a Client ID to test' })

  const startedAt = Date.now()
  const doc = await discoverOidcIssuer(issuer)
  const tookMs = Date.now() - startedAt

  await audit({ actor: user.username, action: 'settings.auth.oidc_test', target: issuer, detail: `tookMs=${tookMs}` })

  return {
    ok: true,
    tookMs,
    issuer: doc.issuer,
    endpoints: {
      authorization: doc.authorization_endpoint,
      token: doc.token_endpoint,
      jwks: doc.jwks_uri,
      userinfo: doc.userinfo_endpoint || null
    },
    scopesSupported: doc.scopes_supported || null,
    claimsSupported: doc.claims_supported || null,
    grantTypesSupported: doc.grant_types_supported || null,
    discovery: doc,
    scope: 'Discovery verified the issuer and required endpoints. Use the popup login test to verify the saved Client ID/Client Secret, authorization redirect, token exchange, ID token claims, role mapping, and UserInfo response.'
  }
})
