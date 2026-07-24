import { getPamDb } from '~~/server/utils/moduleDb'
import { verifyGatewayToken } from '~~/layers/pam/server/utils/pamGateway'

/**
 * Gateway revocation-poll endpoint. The gateway polls this with its token; when
 * the session is terminated/ended or its grant is no longer valid, it tears the
 * live connection down. Read-only (does NOT consume the token's jti).
 */
export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = token ? await verifyGatewayToken(token) : null
  if (!claims) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired gateway token' })

  const db = getPamDb()
  const sess = (await db.query('SELECT state, grant_id FROM pam.sessions WHERE id=$1', [claims.sessionId])).rows[0]
  if (!sess) return { state: 'error', grantValid: false }

  let grantValid = true
  if (sess.grant_id) {
    const g = (await db.query('SELECT status, expires_at FROM pam.access_grants WHERE id=$1', [sess.grant_id])).rows[0]
    grantValid = !!g && g.status === 'active' && Date.parse(g.expires_at) > Date.now()
  }
  setResponseHeaders(event, { 'cache-control': 'no-store' })
  return { state: sess.state, grantValid }
})
