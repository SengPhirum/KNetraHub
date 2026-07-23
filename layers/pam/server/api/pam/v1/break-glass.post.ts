import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, newId, nowIso, getPamSetting, withPamTx } from '~~/layers/pam/server/utils/pamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { pamNotify } from '~~/layers/pam/server/utils/pamNotify'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'

/**
 * Break-glass emergency access (spec §4.8). A DEDICATED workflow — never a
 * rejected normal request converted silently. Requires step-up MFA, a mandatory
 * reason and (by policy) an incident number, grants short-lived emergency
 * access with mandatory recording, immediately alerts security/management,
 * records a critical risk event, and schedules automatic post-use credential
 * rotation + a mandatory post-event review.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.request.create')
  await requirePasswordConfirm(event) // step-up MFA (security password)
  const body = await readBody(event)
  const accountId = String(body?.account_id || '').trim()
  if (!accountId) throw createError({ statusCode: 400, statusMessage: 'account_id is required' })
  const reason = String(body?.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A reason is required for break-glass access' })

  const db = getPamDb()
  const acct = await db.query('SELECT * FROM pam.accounts WHERE id=$1 AND deleted_at IS NULL', [accountId])
  if (!acct.rows.length) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  const account = acct.rows[0]
  // Must at least be able to see the safe (or be admin) — break-glass is not a bypass of all boundaries.
  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (tier !== 'admin' && !perms.has('list_accounts') && !perms.has('view_metadata')) {
    throw createError({ statusCode: 403, statusMessage: 'You have no relationship to this safe' })
  }

  const requireIncident = await getPamSetting<boolean>('break_glass.require_incident', true, db)
  const incident = String(body?.incident_number || '').trim()
  if (requireIncident && !incident) throw createError({ statusCode: 400, statusMessage: 'An incident number is required for break-glass access' })

  const maxMinutes = await getPamSetting<number>('break_glass.max_minutes', 60, db)
  const now = nowIso()
  const expiresAt = new Date(Date.now() + maxMinutes * 60_000).toISOString()

  const requestId = newId()
  const grantId = newId()
  await withPamTx(async (client) => {
    await client.query(
      `INSERT INTO pam.access_requests (id, requester, requester_id, action, reason, ticket_number, emergency, status, max_duration_minutes, start_at, expiry_at, created_at, decided_at)
       VALUES ($1,$2,$3,'use',$4,$5,true,'approved',$6,$7,$8,$7,$7)`,
      [requestId, user.username, user.id, reason, incident || null, maxMinutes, now, expiresAt]
    )
    await client.query('INSERT INTO pam.request_accounts (request_id, account_id) VALUES ($1,$2)', [requestId, accountId])
    await client.query(
      `INSERT INTO pam.access_grants (id, request_id, account_id, grantee, grantee_id, action, starts_at, expires_at, emergency, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'use',$6,$7,true,'active',$6)`,
      [grantId, requestId, accountId, user.username, user.id, now, expiresAt]
    )
  })

  // Alert security/management, record a critical risk event, schedule post-use rotation.
  await pamNotify({ severity: 'critical', event: 'break_glass.started', title: 'Break-glass access invoked',
    body: `${user.username} invoked break-glass on ${account.name} (${account.username})${incident ? ` for incident ${incident}` : ''}.`, objectType: 'account', objectId: accountId, link: `/pam/accounts/${accountId}` }, db)
  await recordRisk({ ruleKey: 'break_glass', actor: user.username, accountId, severity: 'critical', target: account.address,
    explanation: `Break-glass emergency access to ${account.name} by ${user.username}.`, recommendedAction: 'Confirm the incident and complete a post-event review.' }, db)
  await pamAudit(event, user, { action: 'break_glass.start', objectType: 'account', objectId: accountId, safeId: account.safe_id, requestId, severity: 'critical', reason, ticket: incident || null, details: { grantId, maxMinutes } })

  // Automatic post-window credential rotation.
  await enqueueJob({ jobType: 'rotate', accountId, safeId: account.safe_id, platformId: account.platform_id, trigger: 'after-break-glass', runAfter: expiresAt, createdBy: 'break-glass' }, db)

  return { requestId, grantId, expiresAt, maxMinutes, recordingRequired: true }
})
