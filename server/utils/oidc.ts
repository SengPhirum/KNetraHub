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
}

interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
}

// Short-lived cookie that carries the per-login transaction (CSRF state,
// replay nonce, PKCE verifier) across the redirect round-trip.
const TXN_COOKIE = 'dockhub_oidc_txn'

// Discovery document + JWKS are cached per issuer for an hour.
const DISCOVERY_TTL = 60 * 60 * 1000
let discoveryCache: { issuer: string, doc: OidcDiscovery, fetchedAt: number } | null = null
let jwksCache: { uri: string, jwks: ReturnType<typeof createRemoteJWKSet> } | null = null

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

  const url = `${cfg.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  const doc = await $fetch<OidcDiscovery>(url, { timeout: 8000 }).catch((err) => {
    throw createError({ statusCode: 502, statusMessage: `OIDC discovery failed: ${err?.message || err}` })
  })
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw createError({ statusCode: 502, statusMessage: 'OIDC discovery document is missing required endpoints' })
  }

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

/** Build the provider authorization URL and stash the transaction in a cookie. */
export async function oidcBeginLogin(event: H3Event): Promise<string> {
  const cfg = await getOidcSettings()
  const doc = await oidcDiscover(cfg)

  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  setCookie(event, TXN_COOKIE, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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

/** Exchange the callback code, validate the ID token, and map groups to a role. */
export async function oidcCompleteLogin(event: H3Event): Promise<OidcResult> {
  const cfg = await getOidcSettings()
  const doc = await oidcDiscover(cfg)
  const query = getQuery(event)

  const txnRaw = getCookie(event, TXN_COOKIE)
  deleteCookie(event, TXN_COOKIE, { path: '/' })

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
  const tokens = await $fetch<{ id_token?: string, access_token?: string }>(doc.token_endpoint, {
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

  // 2. validate the ID token signature, issuer, audience, and nonce
  const { payload } = await jwtVerify(tokens.id_token, jwks(doc.jwks_uri), {
    issuer: doc.issuer,
    audience: cfg.clientId
  }).catch((err) => {
    throw createError({ statusCode: 401, statusMessage: `ID token validation failed: ${err?.message || err}` })
  })
  if (payload.nonce !== txn.nonce) {
    throw createError({ statusCode: 401, statusMessage: 'Nonce mismatch' })
  }

  // 3. some providers (e.g. Okta) only expose groups via the userinfo endpoint
  let claims: Record<string, unknown> = payload
  if (claimPath(claims, cfg.groupsClaim) === undefined && doc.userinfo_endpoint && tokens.access_token) {
    const info = await $fetch<Record<string, unknown>>(doc.userinfo_endpoint, {
      timeout: 8000,
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    }).catch(() => null)
    if (info) claims = { ...info, ...payload }
  }

  const username =
    str(claimPath(claims, cfg.usernameClaim)) || str(claims.email) || str(claims.sub)
  if (!username) {
    throw createError({ statusCode: 401, statusMessage: `ID token has no usable "${cfg.usernameClaim}", email, or sub claim` })
  }
  const displayName = str(claimPath(claims, cfg.displayNameClaim)) || username
  const email = str(claims.email) || undefined
  const role = resolveRole(claimPath(claims, cfg.groupsClaim), cfg)

  return { username, displayName, email, role }
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
