import type { H3Event } from 'h3'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from './store'

export interface SessionUser {
  id: string
  username: string
  displayName: string
  role: Role
  source: 'local' | 'ldap'
}

// Keep the legacy cookie name so existing sessions survive the DockHub rebrand.
const COOKIE = 'dockhub_token'

function secret() {
  return new TextEncoder().encode(useRuntimeConfig().jwtSecret)
}

export async function issueToken(user: SessionUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())
}

export async function setSession(event: H3Event, user: SessionUser) {
  const token = await issueToken(user)
  setCookie(event, COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12
  })
}

export function clearAuthSession(event: H3Event) {
  deleteCookie(event, COOKIE, { path: '/' })
}

export async function readSession(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return {
      id: String(payload.id),
      username: String(payload.username),
      displayName: String(payload.displayName),
      role: payload.role as Role,
      source: payload.source as 'local' | 'ldap'
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

const RANK: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 }

/** Require at least the given role, or throw 403. */
export async function requireRole(event: H3Event, min: Role): Promise<SessionUser> {
  const user = await requireUser(event)
  if (RANK[user.role] < RANK[min]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${min} role` })
  }
  return user
}
