import { getPamDb } from '~~/server/utils/moduleDb'
import { verifyGatewayToken } from '~~/layers/pam/server/utils/pamGateway'
import { openActiveCredential, createLease } from '~~/layers/pam/server/utils/pamVault'
import { appendAudit } from '~~/layers/pam/server/utils/pamAudit'
import { clientIp } from '~~/layers/pam/server/utils/pamStore'

/**
 * Gateway credential checkout — called ONLY by the session gateway (SSH bastion
 * / guacd adapter) with its short-lived gateway token, over the internal PAM
 * overlay network (mTLS in production). Re-validates the session and its grant,
 * then returns the target credential so the gateway can inject it server-side.
 * The browser/native client never has a path to this endpoint or the credential.
 */
export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = token ? await verifyGatewayToken(token) : null
  if (!claims) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired gateway token' })

  const db = getPamDb()
  const sess = await db.query("SELECT * FROM pam.sessions WHERE id=$1", [claims.sessionId])
  if (!sess.rows.length) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  const session = sess.rows[0]
  if (['ended', 'terminated', 'error'].includes(session.state)) {
    throw createError({ statusCode: 409, statusMessage: `Session is ${session.state}` })
  }

  // Re-evaluate the grant at connect time (revocation/expiry fail closed).
  if (session.grant_id) {
    const g = await db.query("SELECT status, expires_at FROM pam.access_grants WHERE id=$1", [session.grant_id])
    const grant = g.rows[0]
    if (!grant || grant.status !== 'active' || Date.parse(grant.expires_at) <= Date.now()) {
      await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason='grant not valid at connect' WHERE id=$1", [claims.sessionId, new Date().toISOString()])
      throw createError({ statusCode: 403, statusMessage: 'Access grant is no longer valid' })
    }
  }

  const account = (await db.query('SELECT * FROM pam.accounts WHERE id=$1', [claims.accountId])).rows[0]
  if (!account || !account.enabled) throw createError({ statusCode: 409, statusMessage: 'Account unavailable' })
  const cred = await openActiveCredential(claims.accountId, db)
  if (!cred) throw createError({ statusCode: 409, statusMessage: 'Account has no stored credential' })

  await createLease({ accountId: claims.accountId, credentialVersion: cred.version, lessee: claims.user, leaseType: 'session', ttlSeconds: 3600, sessionId: claims.sessionId, sourceIp: clientIp(event) }, db)
  await db.query("UPDATE pam.sessions SET state='active', last_activity_at=$2 WHERE id=$1 AND state='starting'", [claims.sessionId, new Date().toISOString()])
  await appendAudit({ actor: `gateway:${claims.user}`, action: 'session.credential.checkout', objectType: 'session', objectId: claims.sessionId, sessionId: claims.sessionId, result: 'success', severity: 'notice', sourceIp: clientIp(event) }, db)

  setResponseHeaders(event, { 'cache-control': 'no-store, private' })
  return {
    protocol: session.protocol,
    target: { host: account.address, port: account.port || (session.protocol === 'ssh' ? 22 : undefined) },
    credential: { username: account.username, value: cred.value, valueType: cred.valueType },
    idleTimeoutSeconds: 900,
    maxDurationSeconds: 14_400
  }
})
