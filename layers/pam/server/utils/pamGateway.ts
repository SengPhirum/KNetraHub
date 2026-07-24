import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'

/**
 * Short-lived, audience-scoped session tokens for the PAM session gateway
 * (SSH bastion / guacd adapter). The browser (or native client) receives ONLY
 * this token — never the target credential. The gateway re-evaluates PAM policy
 * and retrieves+injects the credential internally, then streams and records I/O
 * and posts session events/commands/recording bytes back with the same token.
 *
 * Replay protection: every token carries a unique `jti` recorded in
 * pam.gateway_tokens. The credential checkout CONSUMES the jti atomically, so a
 * captured token can never be exchanged for a credential twice, even inside its
 * 5-minute TTL. Ingest/recording callbacks re-verify signature+audience+exp but
 * do not consume, so the gateway can keep reporting during the session.
 */
const AUDIENCE = 'knetrahub-pam-gateway'

function secret() {
  return new TextEncoder().encode(useRuntimeConfig().jwtSecret)
}

export interface GatewayTokenClaims {
  sessionId: string
  accountId: string
  grantId: string
  protocol: string
  user: string
  jti?: string
}

/** Issue a one-time gateway token and register its jti for single-use checkout. */
export async function issueGatewayToken(claims: GatewayTokenClaims, ttlSeconds = 300, db: Pool = getPamDb()): Promise<string> {
  const jti = randomUUID()
  const nowMs = Date.now()
  const token = await new SignJWT({ ...claims, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setNotBefore(Math.floor(nowMs / 1000) - 5)
    .setAudience(AUDIENCE)
    .setExpirationTime(Math.floor(nowMs / 1000) + ttlSeconds)
    .sign(secret())
  await db.query(
    'INSERT INTO pam.gateway_tokens (jti, session_id, user_name, issued_at, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [jti, claims.sessionId, claims.user || null, new Date(nowMs).toISOString(), new Date(nowMs + ttlSeconds * 1000).toISOString()]
  )
  return token
}

export async function verifyGatewayToken(token: string): Promise<GatewayTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE })
    if (!payload.sessionId || !payload.accountId) return null
    return {
      sessionId: String(payload.sessionId),
      accountId: String(payload.accountId),
      grantId: String(payload.grantId || ''),
      protocol: String(payload.protocol || 'ssh'),
      user: String(payload.user || ''),
      jti: payload.jti ? String(payload.jti) : undefined
    }
  } catch {
    return null
  }
}

/**
 * Atomically consume a token's jti. Returns true exactly once per jti; false on
 * replay (already consumed) or unknown jti. This is the single-use enforcement
 * point, called by the credential checkout.
 */
export async function consumeGatewayToken(jti: string | undefined, consumedBy: string, db: Pool = getPamDb()): Promise<boolean> {
  if (!jti) return false
  const { rowCount } = await db.query(
    'UPDATE pam.gateway_tokens SET consumed_at=$2, consumed_by=$3 WHERE jti=$1 AND consumed_at IS NULL',
    [jti, new Date().toISOString(), consumedBy]
  )
  return (rowCount ?? 0) > 0
}

/** Housekeeping: drop expired one-time tokens. */
export async function purgeExpiredGatewayTokens(db: Pool = getPamDb()): Promise<number> {
  const { rowCount } = await db.query('DELETE FROM pam.gateway_tokens WHERE expires_at < $1', [new Date().toISOString()])
  return rowCount ?? 0
}
