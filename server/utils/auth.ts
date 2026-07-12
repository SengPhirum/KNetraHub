import type { H3Event } from 'h3'
import { SignJWT, jwtVerify } from 'jose'
import type { Role, UserSource } from './store'
import { lookupApiTokenUser, createSession, getSessionLastSeen, touchSession } from './store'
import { roleHasPermission, type Permission } from '../../shared/utils/permissions'
import {
  resolveEntitlements,
  tierAtLeast,
  tierGrantsPermission,
  appForPermission,
  type AppKey,
  type AppTier,
  type AppEntitlements
} from '../../shared/utils/entitlements'
import { getAppRoleMap } from './appRoles'
import { logSystem } from './moduleLogs'

export interface SessionUser {
  id: string
  username: string
  displayName: string
  role: Role
  source: UserSource
  /** Keycloak realm roles (realm_access.roles), used to resolve per-app access. */
  realmRoles: string[]
  /** Per-app tier assigned directly to this user (local accounts only - see
   *  shared/utils/entitlements.ts). Snapshotted into the JWT at login, same
   *  staleness characteristics as realmRoles until the next login. */
  appAccess?: Record<string, string>
  /** Browser-session id (JWT `sid` claim). Absent for API-token auth. Lets a
   *  stateless cookie JWT be revoked by deleting its sessions row. */
  sid?: string
}

// Keep the legacy cookie name so existing sessions survive the KNetraHub rebrand.
const COOKIE = 'knetrahub_token'

function secret() {
  return new TextEncoder().encode(useRuntimeConfig().jwtSecret)
}

export async function issueToken(user: SessionUser, sid?: string): Promise<string> {
  return await new SignJWT({ ...user, ...(sid ? { sid } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())
}

/**
 * Short-lived token for remote subsystem UIs (KNetraHub-Net, -Server,
 * -IPMgt) to call their own APIs with. The portal's main session lives in an
 * httpOnly cookie by design (a remote's JS can't read it, which is the
 * point), so RemoteModuleLoader fetches this from the portal's own origin
 * (same-origin request, cookie sent automatically) and hands it to the
 * remote as a prop. Subsystem APIs verify it with the same jwtSecret and
 * the `aud` claim - same signing key as the main session, but scoped
 * narrower (5 minutes) so a leaked copy is far less useful than the cookie.
 *
 * The token also carries the user's resolved per-app entitlements so each
 * subsystem API can enforce the same tier the portal used to gate the UI,
 * without having to re-read the portal's app-role map.
 */
export async function issueSubsystemToken(user: SessionUser): Promise<string> {
  const apps = await resolveUserEntitlements(user)
  return await new SignJWT({ ...user, apps })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience('knetrahub-subsystem')
    .setExpirationTime('5m')
    .sign(secret())
}

/** Resolve the caller's per-app entitlements from their realm roles + the DB role map. */
export async function resolveUserEntitlements(user: SessionUser): Promise<AppEntitlements> {
  const roleMap = await getAppRoleMap()
  return resolveEntitlements(user, user.realmRoles || [], roleMap)
}

export async function setSession(event: H3Event, user: SessionUser) {
  // Record the session so it can be listed/revoked, and bind the token to it.
  const userAgent = getRequestHeader(event, 'user-agent') ?? null
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0]!.trim() : '')
    || getRequestHeader(event, 'x-real-ip')
    || event.node.req.socket?.remoteAddress
    || null
  // Degrade gracefully: if the session row can't be created (e.g. DB hiccup),
  // still issue a working (un-revocable) token rather than failing login.
  let sid: string | undefined
  try {
    sid = await createSession(user.id, userAgent, ip)
  } catch (err: any) {
    await logSystem('portal', 'warning', 'auth.session.degraded',
      `Could not create session row for ${user.username}; issued an un-revocable token instead: ${err?.message || err}`)
  }
  const token = await issueToken(user, sid)
  setCookie(event, COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Only mark Secure when actually served over HTTPS - swarm deployments are
    // often reached over plain HTTP via IP (e.g. http://host:3000), and a
    // Secure cookie set there is silently dropped by the browser, breaking
    // every subsequent authenticated request with a 401.
    secure: getRequestProtocol(event) === 'https',
    path: '/',
    maxAge: 60 * 60 * 12
  })
}

export function clearAuthSession(event: H3Event) {
  deleteCookie(event, COOKIE, { path: '/' })
}

// Per-app middleware (appAccess) and each endpoint's own requireUser/requireRole
// both resolve the caller's session, which previously meant two round-trips to
// the sessions table (cookie/JWT verify + a DB lookup for revocation) on every
// single request. H3Event.context is unique per request, so memoizing here
// collapses that back down to one resolution regardless of how many times
// readSession is called while handling the request.
const SESSION_CACHE_KEY = '_sessionUser' as const
interface SessionCacheContext { [SESSION_CACHE_KEY]?: SessionUser | null }

export async function readSession(event: H3Event): Promise<SessionUser | null> {
  const ctx = event.context as SessionCacheContext
  if (SESSION_CACHE_KEY in ctx) return ctx[SESSION_CACHE_KEY] ?? null
  const user = await resolveSession(event)
  ctx[SESSION_CACHE_KEY] = user
  return user
}

async function resolveSession(event: H3Event): Promise<SessionUser | null> {
  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const user = await lookupApiTokenUser(authHeader.slice(7))
    // API tokens are local-user scoped and have no Keycloak realm roles.
    if (user) return { ...user, realmRoles: [] }
  }
  const token = getCookie(event, COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined
    // Session-bound tokens can be revoked: if the sessions row is gone, the
    // token is no longer valid. On a DB error we fail open (don't lock everyone
    // out on a transient hiccup); tokens issued before this feature have no sid
    // and stay valid until they expire.
    if (sid) {
      try {
        const lastSeen = await getSessionLastSeen(sid)
        if (lastSeen === null) return null
        if (Date.now() - new Date(lastSeen).getTime() > 120_000) touchSession(sid).catch(() => {})
      } catch {
        // fail open
      }
    }
    return {
      id: String(payload.id),
      username: String(payload.username),
      displayName: String(payload.displayName),
      role: payload.role as Role,
      source: payload.source as UserSource,
      realmRoles: Array.isArray(payload.realmRoles) ? (payload.realmRoles as string[]) : [],
      appAccess: payload.appAccess && typeof payload.appAccess === 'object' ? (payload.appAccess as Record<string, string>) : undefined,
      ...(sid ? { sid } : {})
    }
  } catch {
    return null
  }
}

/** Require a logged-in user, or throw 401. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await readSession(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return user
}

const RANK: Record<Role, number> = { viewer: 1, operator: 2, manager: 3, admin: 4 }

// The appAccess middleware resolves the caller's tier for the app that owns the
// route and stashes it here. requireRole/requirePermission then enforce against
// the *app* tier instead of the global role, so a Keycloak dock-operator (who is
// globally a viewer) can perform operator actions in Dock - without any of the
// existing Docker endpoint handlers changing.
interface AppContext { effectiveApp?: AppKey; effectiveTier?: AppTier }
function appCtx(event: H3Event): AppContext {
  return (event.context as AppContext) || {}
}

/**
 * Require at least the given role/tier, or throw 403. For app-scoped routes
 * (where the appAccess middleware set an effective tier) this compares against
 * the per-app tier; otherwise it compares the user's global role (unchanged
 * behaviour for portal routes).
 */
export async function requireRole(event: H3Event, min: Role): Promise<SessionUser> {
  const user = await requireUser(event)
  const tier = appCtx(event).effectiveTier
  if (tier) {
    if (!tierAtLeast(tier, min as AppTier)) {
      throw createError({ statusCode: 403, statusMessage: `Requires ${min} access` })
    }
    return user
  }
  if (RANK[user.role] < RANK[min]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${min} role` })
  }
  return user
}

/**
 * Fine-grained permission check. For app-scoped routes, the permission is
 * checked against the effective app tier; otherwise against the global role.
 */
export async function requirePermission(event: H3Event, permission: Permission): Promise<SessionUser> {
  const user = await requireUser(event)
  const { effectiveApp, effectiveTier } = appCtx(event)
  if (effectiveApp && effectiveTier && appForPermission(permission) === effectiveApp) {
    if (!tierGrantsPermission(effectiveApp, effectiveTier, permission)) {
      throw createError({ statusCode: 403, statusMessage: `Requires permission: ${permission}` })
    }
    return user
  }
  if (!roleHasPermission(user.role, permission)) {
    throw createError({ statusCode: 403, statusMessage: `Requires permission: ${permission}` })
  }
  return user
}

/**
 * Require access to a specific app at a minimum tier, resolved live from the
 * caller's realm roles + the DB role map. Used by new endpoints that aren't
 * covered by the route-prefix appAccess middleware.
 */
export async function requireApp(event: H3Event, app: AppKey, min: AppTier = 'viewer'): Promise<SessionUser> {
  const user = await requireUser(event)
  const apps = await resolveUserEntitlements(user)
  if (!tierAtLeast(apps[app], min)) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${min} access to ${app}` })
  }
  return user
}
