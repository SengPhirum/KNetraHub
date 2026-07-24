import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, loadOr404, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { issueGatewayToken } from '~~/layers/pam/server/utils/pamGateway'

/**
 * Re-issue a fresh one-time gateway token for an in-flight session (reconnect).
 * The previous token's jti is single-use, so a reconnect needs a new token. The
 * session must still be live, owned by the caller, and its grant valid.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.session.connect')
  const id = getRouterParam(event, 'id')!
  const session = await loadOr404<any>('pam.sessions', id, 'Session not found')

  if (session.principal?.toLowerCase() !== user.username.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot obtain a token for this session' })
  }
  if (!['starting', 'active', 'idle'].includes(session.state)) {
    throw createError({ statusCode: 409, statusMessage: `Session is ${session.state}` })
  }

  const db = getPamDb()
  if (session.grant_id) {
    const g = await db.query("SELECT status, expires_at, starts_at FROM pam.access_grants WHERE id=$1", [session.grant_id])
    const grant = g.rows[0]
    const now = Date.now()
    if (!grant || grant.status !== 'active' || Date.parse(grant.expires_at) <= now || Date.parse(grant.starts_at) > now) {
      throw createError({ statusCode: 403, statusMessage: 'Access grant is not currently valid' })
    }
  }

  const token = await issueGatewayToken({
    sessionId: id, accountId: session.account_id, grantId: session.grant_id ?? '', protocol: session.protocol, user: user.username
  }, 300, db)
  await pamAudit(event, user, { action: 'session.token.reissue', objectType: 'session', objectId: id, sessionId: id, severity: 'notice' })
  return { sessionId: id, gatewayToken: token, tokenTtlSeconds: 300 }
})
