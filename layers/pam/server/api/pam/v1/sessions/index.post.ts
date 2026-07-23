import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, clientIp, userAgent, newId, nowIso, getPamSetting } from '~~/layers/pam/server/utils/pamStore'
import { issueGatewayToken } from '~~/layers/pam/server/utils/pamGateway'
import { sourceNetworkAllowed } from '~~/layers/pam/server/utils/pamPolicy'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'

/**
 * Start a brokered session. Validates an active grant, safe use permission,
 * source-network policy and concurrent-session limits, creates the session
 * record and (when recording is required) a pending recording, then returns a
 * short-lived gateway token. The browser NEVER receives the target credential —
 * the gateway retrieves and injects it internally.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.session.connect')
  const body = await readBody(event)
  const accountId = String(body?.account_id || '').trim()
  const grantId = String(body?.grant_id || '').trim()
  if (!accountId) throw createError({ statusCode: 400, statusMessage: 'account_id is required' })

  const db = getPamDb()
  const acct = await db.query('SELECT * FROM pam.accounts WHERE id=$1 AND deleted_at IS NULL', [accountId])
  if (!acct.rows.length) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  const account = acct.rows[0]
  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!perms.has('use_account')) throw createError({ statusCode: 403, statusMessage: 'You cannot use accounts in this safe' })

  // A valid active grant is required (admins may also self-serve).
  const grantRows = await db.query(
    grantId
      ? "SELECT * FROM pam.access_grants WHERE id=$1 AND account_id=$2 AND status='active'"
      : "SELECT * FROM pam.access_grants WHERE account_id=$2 AND lower(grantee)=lower($1) AND status='active' ORDER BY expires_at DESC LIMIT 1",
    grantId ? [grantId, accountId] : [user.username, accountId]
  )
  const grant = grantRows.rows[0]
  if (!grant && tier !== 'admin') {
    await pamAudit(event, user, { action: 'session.start.denied', objectType: 'account', objectId: accountId, safeId: account.safe_id, severity: 'high', result: 'denied', reason: 'no active grant' })
    throw createError({ statusCode: 403, statusMessage: 'An approved, active access grant is required to connect. Submit an access request.' })
  }
  const now = Date.now()
  if (grant) {
    if (Date.parse(grant.expires_at) <= now || Date.parse(grant.starts_at) > now) {
      throw createError({ statusCode: 403, statusMessage: 'The access grant is not currently valid (expired or not yet started)' })
    }
    if (grant.max_use_count && Number(grant.use_count) >= Number(grant.max_use_count)) {
      throw createError({ statusCode: 403, statusMessage: 'The access grant has reached its maximum use count' })
    }
    if (grant.source_network && !sourceNetworkAllowed(clientIp(event), [grant.source_network])) {
      await recordRisk({ ruleKey: 'disallowed_source', actor: user.username, accountId, target: account.address, explanation: `Session attempt from ${clientIp(event)} outside the granted source network.` }, db)
      throw createError({ statusCode: 403, statusMessage: 'Your source network is not permitted for this grant' })
    }
    // Concurrent-session limit.
    const active = await db.query("SELECT count(*)::int c FROM pam.sessions WHERE grant_id=$1 AND state IN ('starting','active','idle')", [grant.id])
    if (Number(active.rows[0].c) >= Number(grant.max_concurrent_sessions || 1)) {
      throw createError({ statusCode: 409, statusMessage: 'Concurrent session limit reached for this grant' })
    }
  }

  const protocol = String(body?.protocol || account.account_type === 'database' ? 'db' : 'ssh')
  const recordingRequired = grant?.emergency === true || await getPamSetting<boolean>('session.recording_required_default', true, db)
  const gwRows = await db.query("SELECT id FROM pam.gateways WHERE enabled=true AND drain_mode=false ORDER BY (kind = $1) DESC LIMIT 1", [protocol])
  const gatewayId = gwRows.rows[0]?.id ?? null

  const sessionId = newId()
  const iso = nowIso()
  await db.query(
    `INSERT INTO pam.sessions
      (id, account_id, grant_id, request_id, gateway_id, principal, user_id, target, protocol,
       source_ip, user_agent, reason, ticket, recording_required, recording_status, state, emergency, started_at, last_activity_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'starting',$16,$17,$17)`,
    [sessionId, accountId, grant?.id ?? null, grant?.request_id ?? null, gatewayId, user.username, user.id,
      account.address, protocol, clientIp(event), userAgent(event), body?.reason || grant?.action || null,
      grant?.request_id ? null : null, recordingRequired, recordingRequired ? 'pending' : 'disabled',
      grant?.emergency === true, iso]
  )
  await db.query('INSERT INTO pam.session_events (id, session_id, ts, kind, detail) VALUES ($1,$2,$3,$4,$5)',
    [newId(), sessionId, iso, 'session.requested', JSON.stringify({ protocol, gatewayId })])
  if (grant) await db.query('UPDATE pam.access_grants SET use_count = use_count + 1 WHERE id=$1', [grant.id])
  await db.query('UPDATE pam.accounts SET last_used=$2 WHERE id=$1', [accountId, iso])

  const token = await issueGatewayToken({ sessionId, accountId, grantId: grant?.id ?? '', protocol, user: user.username })
  await pamAudit(event, user, { action: 'session.start', objectType: 'session', objectId: sessionId, safeId: account.safe_id, sessionId, severity: 'notice', details: { protocol, accountId } })

  return {
    sessionId,
    protocol,
    gatewayToken: token,
    gatewayId,
    recordingRequired,
    // The gateway endpoint the client connects to (never the credential).
    connect: { endpoint: `/api/pam/v1/gateway/connect`, tokenTtlSeconds: 300 },
    note: 'Present gatewayToken to the PAM session gateway. The target credential is injected server-side and never returned to the client.'
  }
})
