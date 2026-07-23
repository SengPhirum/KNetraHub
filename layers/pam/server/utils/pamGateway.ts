import { SignJWT, jwtVerify } from 'jose'

/**
 * Short-lived, audience-scoped session tokens for the PAM session gateway
 * (SSH bastion / guacd adapter). The browser (or native client) receives ONLY
 * this token — never the target credential. The gateway re-evaluates PAM policy
 * and retrieves+injects the credential internally, then streams and records I/O
 * and posts session events/commands/recording metadata back with the same
 * token. Signed with the portal jwtSecret but scoped narrowly (audience +
 * 5-minute TTL) so a leaked token is far less useful than the session cookie.
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
}

export async function issueGatewayToken(claims: GatewayTokenClaims, ttlSeconds = 300): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret())
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
      user: String(payload.user || '')
    }
  } catch {
    return null
  }
}
