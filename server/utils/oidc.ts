import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Role } from './store'
import { getOidcSettings } from './authSettings'
import type { OidcSettings } from './authSettings'

export interface OidcResult {
  username: string
  displayName: string
  email?: string
  role: Role
  /** Keycloak realm roles (from cfg.rolesClaim), used for per-app access. */
  realmRoles: string[]
}

export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
  scopes_supported?: string[]
  claims_supported?: string[]
  grant_types_supported?: string[]
}

export interface OidcLoginTestReport {
  ok: true
  completedAt: string
  tookMs: number
  issuer: string
  clientId: string
  redirectUri: string
  endpoints: {
    authorization: string
    token: string
    jwks: string
    userinfo: string | null
  }
  token: {
    tookMs: number
    response: Record<string, unknown>
  }
  idToken: {
    valid: true
    tookMs: number
    header: Record<string, unknown>
    claims: Record<string, unknown>
  }
  accessToken: {
    present: boolean
    format: 'jwt' | 'opaque' | null
    valid: boolean | null
    tookMs: number | null
    header: Record<string, unknown> | null
    claims: Record<string, unknown> | null
    error: string | null
  }
  userinfo: {
    advertised: boolean
    attempted: boolean
    ok: boolean | null
    tookMs: number | null
    endpoint: string | null
    response: Record<string, unknown> | null
    error: string | null
  }
  rolesClaim: {
    path: string
    found: boolean
    source: 'id_token' | 'userinfo' | 'access_token' | null
    value: unknown
  }
  mappedUser: OidcResult
}

// Short-lived cookie that carries the per-login transaction (CSRF state,
// replay nonce, PKCE verifier) across the redirect round-trip.
const TXN_COOKIE = 'knetrahub_oidc_txn'
const TEST_TXN_COOKIE = 'knetrahub_oidc_test_txn'

// Discovery document + JWKS are cached per issuer for an hour.
const DISCOVERY_TTL = 60 * 60 * 1000
let discoveryCache: { issuer: string, doc: OidcDiscovery, fetchedAt: number } | null = null
let jwksCache: { uri: string, jwks: ReturnType<typeof createRemoteJWKSet> } | null = null

/**
 * Uncached discovery fetch against an arbitrary issuer - the shared low-level
 * step used both by the real (cached) login-flow discovery below and by the
 * admin-facing "Test & Query" action, which must always hit the network live
 * (an admin testing a just-typed issuer URL should never see a stale/cached
 * result from a previous, possibly different issuer).
 */
export async function discoverOidcIssuer(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  const doc = await $fetch<OidcDiscovery>(url, { timeout: 8000 }).catch((err) => {
    throw createError({ statusCode: 502, statusMessage: `OIDC discovery failed: ${err?.data?.message || err?.message || err}` })
  })
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw createError({ statusCode: 502, statusMessage: 'OIDC discovery document is missing required endpoints (authorization_endpoint/token_endpoint/jwks_uri)' })
  }
  return doc
}

export async function oidcDiscover(cfg: OidcSettings): Promise<OidcDiscovery> {
  if (!cfg.enabled) {
    throw createError({ statusCode: 400, statusMessage: 'OIDC is not enabled' })
  }
  if (!cfg.issuer || !cfg.clientId) {
    throw createError({ statusCode: 500, statusMessage: 'OIDC is enabled but issuer/clientId are not configured' })
  }

  if (discoveryCache && discoveryCache.issuer === cfg.issuer && Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL) {
    return discoveryCache.doc
  }

  const doc = await discoverOidcIssuer(cfg.issuer)
  discoveryCache = { issuer: cfg.issuer, doc, fetchedAt: Date.now() }
  return doc
}

function jwks(uri: string) {
  if (!jwksCache || jwksCache.uri !== uri) {
    jwksCache = { uri, jwks: createRemoteJWKSet(new URL(uri)) }
  }
  return jwksCache.jwks
}

export function oidcRedirectUri(event: H3Event, cfg: OidcSettings): string {
  if (cfg.redirectUri) return cfg.redirectUri
  return `${getRequestURL(event).origin}/api/auth/oidc/callback`
}

function oidcAuthorizationUrl(event: H3Event, cfg: OidcSettings, doc: OidcDiscovery, cookieName: string): string {
  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  setCookie(event, cookieName, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRequestProtocol(event) === 'https',
    path: '/',
    maxAge: 600
  })

  const url = new URL(doc.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', oidcRedirectUri(event, cfg))
  url.searchParams.set('scope', cfg.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** Build the provider authorization URL and stash the transaction in a cookie. */
export async function oidcBeginLogin(event: H3Event): Promise<string> {
  const cfg = await getOidcSettings()
  const doc = await oidcDiscover(cfg)
  return oidcAuthorizationUrl(event, cfg, doc, TXN_COOKIE)
}

/**
 * Start the admin-only interactive login test. It deliberately uses the saved
 * settings (including the server-side client secret), but does not require the
 * provider to be enabled. The normal callback URI is reused so providers do
 * not need a second allow-listed redirect URI just for diagnostics.
 */
export async function oidcBeginLoginTest(event: H3Event): Promise<string> {
  const cfg = await getOidcSettings()
  if (!cfg.issuer || !cfg.clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Save an issuer URL and Client ID before testing login' })
  }
  const doc = await discoverOidcIssuer(cfg.issuer)
  return oidcAuthorizationUrl(event, cfg, doc, TEST_TXN_COOKIE)
}

/** True when the shared OIDC callback belongs to an interactive admin test. */
export function isOidcLoginTestCallback(event: H3Event): boolean {
  const testTxn = getCookie(event, TEST_TXN_COOKIE)
  if (!testTxn) return false

  // If both a normal and a test transaction exist, route by state so an
  // abandoned popup cannot accidentally capture a later normal sign-in.
  if (!getCookie(event, TXN_COOKIE)) return true
  try {
    return JSON.parse(testTxn)?.state === getQuery(event).state
  } catch {
    return false
  }
}

interface OidcCompletion {
  result: OidcResult
  tokenTookMs: number
  tokenResponse: Record<string, unknown>
  idTokenTookMs: number
  idTokenHeader: Record<string, unknown>
  idTokenClaims: Record<string, unknown>
  accessToken: OidcLoginTestReport['accessToken']
  userinfo: OidcLoginTestReport['userinfo']
  rolesClaim: OidcLoginTestReport['rolesClaim']
}

/** Exchange the callback code, validate the ID token, and map groups to a role. */
async function completeOidc(
  event: H3Event,
  cfg: OidcSettings,
  doc: OidcDiscovery,
  cookieName: string,
  alwaysQueryUserinfo: boolean
): Promise<OidcCompletion> {
  const query = getQuery(event)

  const txnRaw = getCookie(event, cookieName)
  deleteCookie(event, cookieName, { path: '/' })

  if (query.error) {
    throw createError({ statusCode: 401, statusMessage: `Provider returned: ${query.error_description || query.error}` })
  }
  if (!txnRaw) {
    throw createError({ statusCode: 401, statusMessage: 'Login transaction expired - try again' })
  }
  let txn: { state: string, nonce: string, verifier: string }
  try {
    txn = JSON.parse(txnRaw)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid login transaction' })
  }
  if (!query.code || !query.state || query.state !== txn.state) {
    throw createError({ statusCode: 401, statusMessage: 'State mismatch - try again' })
  }

  // 1. exchange the authorization code for tokens
  const tokenStartedAt = Date.now()
  const tokens = await $fetch<Record<string, unknown> & { id_token?: string, access_token?: string }>(doc.token_endpoint, {
    method: 'POST',
    timeout: 8000,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(query.code),
      redirect_uri: oidcRedirectUri(event, cfg),
      client_id: cfg.clientId,
      ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
      code_verifier: txn.verifier
    })
  }).catch((err) => {
    throw createError({ statusCode: 401, statusMessage: `Token exchange failed: ${err?.data?.error_description || err?.message || err}` })
  })
  if (!tokens.id_token) {
    throw createError({ statusCode: 401, statusMessage: 'Provider did not return an ID token' })
  }
  const tokenTookMs = Date.now() - tokenStartedAt

  // 2. validate the ID token signature, issuer, audience, and nonce
  const validationStartedAt = Date.now()
  const { payload, protectedHeader } = await jwtVerify(tokens.id_token, jwks(doc.jwks_uri), {
    issuer: doc.issuer,
    audience: cfg.clientId
  }).catch((err) => {
    throw createError({ statusCode: 401, statusMessage: `ID token validation failed: ${err?.message || err}` })
  })
  if (payload.nonce !== txn.nonce) {
    throw createError({ statusCode: 401, statusMessage: 'Nonce mismatch' })
  }
  const idTokenTookMs = Date.now() - validationStartedAt

  // Keycloak normally places resource_access.<client>.roles in its JWT access
  // token. Verify that JWT before exposing or using any of its claims. Opaque
  // access tokens remain usable for UserInfo but cannot be decoded here.
  const accessToken = await inspectAccessToken(tokens.access_token, doc)

  // 3. some providers (e.g. Okta) only expose groups via the userinfo endpoint
  let claims: Record<string, unknown> = payload
  const needsUserinfoForGroups = firstClaim(cfg.groupsClaim, [
    { source: 'id_token', claims: payload },
    { source: 'access_token', claims: accessToken.valid ? accessToken.claims : null }
  ]).value === undefined
  const userinfo: OidcLoginTestReport['userinfo'] = {
    advertised: !!doc.userinfo_endpoint,
    attempted: false,
    ok: null,
    tookMs: null,
    endpoint: doc.userinfo_endpoint || null,
    response: null,
    error: null
  }
  if ((alwaysQueryUserinfo || needsUserinfoForGroups) && doc.userinfo_endpoint && tokens.access_token) {
    userinfo.attempted = true
    const userinfoStartedAt = Date.now()
    try {
      const info = await $fetch<Record<string, unknown>>(doc.userinfo_endpoint, {
        timeout: 8000,
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
      userinfo.tookMs = Date.now() - userinfoStartedAt
      userinfo.response = info

      // OIDC Core requires UserInfo to identify the same subject as the ID
      // token. Report a bad response and never use it for role mapping.
      const idTokenSub = str(payload.sub)
      const userinfoSub = str(info.sub)
      if (!userinfoSub) {
        userinfo.ok = false
        userinfo.error = 'UserInfo response is missing the required sub claim'
      } else if (idTokenSub && userinfoSub !== idTokenSub) {
        userinfo.ok = false
        userinfo.error = 'UserInfo sub claim does not match the ID token subject'
      } else {
        userinfo.ok = true
        if (needsUserinfoForGroups) claims = { ...info, ...payload }
      }
    } catch (err: any) {
      userinfo.tookMs = Date.now() - userinfoStartedAt
      userinfo.ok = false
      userinfo.error = fetchErrorMessage(err)
    }
  } else if (alwaysQueryUserinfo && !doc.userinfo_endpoint) {
    userinfo.error = 'Provider discovery does not advertise a UserInfo endpoint'
  } else if (alwaysQueryUserinfo && !tokens.access_token) {
    userinfo.error = 'Provider did not return an access token for the UserInfo request'
  }

  const username =
    str(claimPath(claims, cfg.usernameClaim)) || str(claims.email) || str(claims.sub)
  if (!username) {
    throw createError({ statusCode: 401, statusMessage: `ID token has no usable "${cfg.usernameClaim}", email, or sub claim` })
  }
  const displayName = str(claimPath(claims, cfg.displayNameClaim)) || username
  const email = str(claims.email) || undefined
  const trustedUserinfo = userinfo.ok ? userinfo.response : null
  const claimSources: ClaimSource[] = [
    { source: 'id_token', claims: payload },
    { source: 'userinfo', claims: trustedUserinfo },
    { source: 'access_token', claims: accessToken.valid ? accessToken.claims : null }
  ]
  const groupsClaim = firstClaim(cfg.groupsClaim, claimSources)
  const rolesClaim = firstClaim(cfg.rolesClaim, claimSources)
  const role = resolveRole(groupsClaim.value, cfg)
  const realmRoles = normalizeGroups(rolesClaim.value)

  return {
    result: { username, displayName, email, role, realmRoles },
    tokenTookMs,
    tokenResponse: redactTokenResponse(tokens),
    idTokenTookMs,
    idTokenHeader: protectedHeader as Record<string, unknown>,
    idTokenClaims: payload,
    accessToken,
    userinfo,
    rolesClaim: {
      path: cfg.rolesClaim,
      found: rolesClaim.value !== undefined,
      source: rolesClaim.source,
      value: rolesClaim.value ?? null
    }
  }
}

export async function oidcCompleteLogin(event: H3Event): Promise<OidcResult> {
  const cfg = await getOidcSettings()
  const doc = await oidcDiscover(cfg)
  return (await completeOidc(event, cfg, doc, TXN_COOKIE, false)).result
}

/** Complete a popup login test without creating a KNetraHub user or session. */
export async function oidcCompleteLoginTest(event: H3Event): Promise<OidcLoginTestReport> {
  const startedAt = Date.now()
  const cfg = await getOidcSettings()
  if (!cfg.issuer || !cfg.clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Saved OIDC settings are incomplete' })
  }
  const doc = await discoverOidcIssuer(cfg.issuer)
  const completion = await completeOidc(event, cfg, doc, TEST_TXN_COOKIE, true)

  return {
    ok: true,
    completedAt: new Date().toISOString(),
    tookMs: Date.now() - startedAt,
    issuer: doc.issuer,
    clientId: cfg.clientId,
    redirectUri: oidcRedirectUri(event, cfg),
    endpoints: {
      authorization: doc.authorization_endpoint,
      token: doc.token_endpoint,
      jwks: doc.jwks_uri,
      userinfo: doc.userinfo_endpoint || null
    },
    token: {
      tookMs: completion.tokenTookMs,
      response: completion.tokenResponse
    },
    idToken: {
      valid: true,
      tookMs: completion.idTokenTookMs,
      header: completion.idTokenHeader,
      claims: completion.idTokenClaims
    },
    accessToken: completion.accessToken,
    userinfo: completion.userinfo,
    rolesClaim: completion.rolesClaim,
    mappedUser: completion.result
  }
}

async function inspectAccessToken(accessToken: string | undefined, doc: OidcDiscovery): Promise<OidcLoginTestReport['accessToken']> {
  if (!accessToken) {
    return {
      present: false,
      format: null,
      valid: null,
      tookMs: null,
      header: null,
      claims: null,
      error: 'Provider did not return an access token'
    }
  }
  if (accessToken.split('.').length !== 3) {
    return {
      present: true,
      format: 'opaque',
      valid: null,
      tookMs: null,
      header: null,
      claims: null,
      error: 'Access token is opaque and cannot be decoded as JWT claims'
    }
  }

  const startedAt = Date.now()
  try {
    const { payload, protectedHeader } = await jwtVerify(accessToken, jwks(doc.jwks_uri), {
      issuer: doc.issuer
    })
    return {
      present: true,
      format: 'jwt',
      valid: true,
      tookMs: Date.now() - startedAt,
      header: protectedHeader as Record<string, unknown>,
      claims: payload,
      error: null
    }
  } catch (err: any) {
    return {
      present: true,
      format: 'jwt',
      valid: false,
      tookMs: Date.now() - startedAt,
      header: null,
      claims: null,
      error: `Access token validation failed: ${fetchErrorMessage(err)}`
    }
  }
}

interface ClaimSource {
  source: 'id_token' | 'userinfo' | 'access_token'
  claims: Record<string, unknown> | null
}

function firstClaim(path: string, sources: ClaimSource[]): { source: ClaimSource['source'] | null, value: unknown } {
  for (const candidate of sources) {
    if (!candidate.claims) continue
    const value = claimPath(candidate.claims, path)
    if (value !== undefined) return { source: candidate.source, value }
  }
  return { source: null, value: undefined }
}

function redactTokenResponse(tokens: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => {
    if (['access_token', 'id_token', 'refresh_token'].includes(key) && typeof value === 'string') {
      return [key, `[redacted ${value.length} characters]`]
    }
    return [key, value]
  }))
}

function fetchErrorMessage(err: any): string {
  return String(
    err?.data?.error_description
      || err?.data?.message
      || err?.data?.error
      || err?.statusMessage
      || err?.message
      || err
  )
}

function resolveRole(groupsClaim: unknown, cfg: OidcSettings): Role {
  const groups = normalizeGroups(groupsClaim).map((g) => g.toLowerCase())
  const admin = cfg.adminGroup?.toLowerCase()
  const operator = cfg.operatorGroup?.toLowerCase()

  // Match plain names and full paths ("/swarm-admins" from Keycloak)
  const has = (wanted: string) => groups.some((g) => g === wanted || g.replace(/^\//, '') === wanted)
  if (admin && has(admin)) return 'admin'
  if (operator && has(operator)) return 'operator'

  // Default for authenticated OIDC users without a matched group
  return 'viewer'
}

function normalizeGroups(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((g) => String(g))
  if (typeof v === 'string') return v.split(/[\s,]+/).filter(Boolean)
  return []
}

/** Read a possibly nested claim, e.g. "realm_access.roles". */
function claimPath(claims: unknown, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), claims)
}

function str(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '')
  return v == null ? '' : String(v)
}
