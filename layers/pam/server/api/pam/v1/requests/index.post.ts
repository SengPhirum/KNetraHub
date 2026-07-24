import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, newId, nowIso, withPamTx, getPamSetting } from '~~/layers/pam/server/utils/pamStore'
import { resolveRequestPolicy, finalizeIfApproved } from '~~/layers/pam/server/utils/pamRequests'
import { validateTicket } from '~~/layers/pam/server/utils/pamTickets'
import { pamNotify } from '~~/layers/pam/server/utils/pamNotify'

const ACTIONS = ['connect', 'use', 'reveal', 'rotate', 'administer']

/**
 * Create an access request over one or more accounts. Resolves the applicable
 * approval policy, validates a ticket if required, creates the approval records
 * for each policy level, and — when the policy needs no approval — auto-approves
 * and issues grants immediately. Never auto-escalates a rejected request.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.request.create')
  const body = await readBody(event)
  const accountIds: string[] = Array.isArray(body?.account_ids) ? body.account_ids.map(String) : (body?.account_id ? [String(body.account_id)] : [])
  if (!accountIds.length) throw createError({ statusCode: 400, statusMessage: 'At least one account is required' })
  const reason = String(body?.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A business reason is required' })
  const action = ACTIONS.includes(body?.action) ? body.action : 'connect'

  const db = getPamDb()
  // The requester must at least be able to see each account's safe.
  const { rows: accts } = await db.query('SELECT id, safe_id, name FROM pam.accounts WHERE id = ANY($1::text[]) AND deleted_at IS NULL', [accountIds])
  if (accts.length !== accountIds.length) throw createError({ statusCode: 404, statusMessage: 'One or more accounts not found' })
  for (const a of accts) {
    const perms = await resolveSafePermissions(user, tier, a.safe_id)
    if (!perms.has('list_accounts') && !perms.has('view_metadata')) {
      throw createError({ statusCode: 403, statusMessage: `You cannot request access to account ${a.name}` })
    }
  }

  const policy = await resolveRequestPolicy(accountIds, db)
  const maxMinutes = policy.maxDurationMinutes
  const requestedMinutes = Math.min(Number(body?.max_duration_minutes) || maxMinutes, maxMinutes)

  const id = newId()
  const now = nowIso()
  await withPamTx(async (client) => {
    await client.query(
      `INSERT INTO pam.access_requests
        (id, requester, requester_id, action, protocol, reason, ticket_system, ticket_number, source_network,
         requested_command, start_at, expiry_at, max_duration_minutes, emergency, policy_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$16)`,
      [id, user.username, user.id, action, body.protocol || null, reason, body.ticket_system || null,
        body.ticket_number || null, body.source_network || null, body.requested_command || null,
        body.start_at || now, body.expiry_at || null, requestedMinutes, body.emergency === true, policy.policyId, now]
    )
    for (const aid of accountIds) {
      await client.query('INSERT INTO pam.request_accounts (request_id, account_id) VALUES ($1,$2)', [id, aid])
    }
    // Approval slots per policy level. A level requiring quorum N pre-creates N
    // pending slots, each filled by a DISTINCT eligible approver (enforced on
    // approve), so a single approval can never satisfy a quorum≥2 level.
    if (policy.approvalType !== 'none' && policy.approvalType !== 'ticket_only') {
      for (const lvl of policy.levels) {
        const slots = Math.max(1, Number(lvl.quorum) || 1)
        for (let s = 0; s < slots; s++) {
          await client.query(
            `INSERT INTO pam.request_approvals (id, request_id, level, approver_type, approver_ref, decision, created_at)
             VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
            [newId(), id, lvl.level, lvl.approverType, lvl.approverRef, now]
          )
        }
      }
    }
  })

  // Ticket validation (when the policy requires it or a ticket was supplied).
  if (policy.requireTicket || body.ticket_number) {
    const result = await validateTicket({
      requestId: id, system: body.ticket_system || 'generic', ticketNumber: String(body.ticket_number || ''),
      requester: user.username
    }, db)
    if (policy.requireTicket && !result.valid) {
      await db.query("UPDATE pam.access_requests SET status='rejected', decision_reason=$2, decided_at=$3 WHERE id=$1",
        [id, `Ticket validation failed: ${result.detail}`, now])
      await pamAudit(event, user, { action: 'request.create', objectType: 'request', objectId: id, severity: 'notice', result: 'denied', reason: 'ticket validation failed' })
      throw createError({ statusCode: 400, statusMessage: `Ticket validation failed: ${result.detail}` })
    }
  }

  // No approval / ticket-only → auto-approve and issue grants immediately.
  let status: string = 'pending'
  if (policy.approvalType === 'none' || policy.approvalType === 'ticket_only') {
    status = await finalizeIfApproved(id, policy, user.username, db)
  } else {
    await pamNotify({ severity: 'info', event: 'approval.requested', title: 'Access approval requested',
      body: `${user.username} requested ${action} access to ${accts.length} account(s).`, objectType: 'request', objectId: id, link: `/pam/requests/${id}` }, db).catch(() => {})
  }

  await pamAudit(event, user, { action: 'request.create', objectType: 'request', objectId: id, severity: 'notice', reason, ticket: body.ticket_number || null, details: { accounts: accountIds.length, action, emergency: body.emergency === true } })
  return { id, status }
})
