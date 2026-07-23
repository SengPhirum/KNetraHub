import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { resolveRequestPolicy, finalizeIfApproved } from '~~/layers/pam/server/utils/pamRequests'
import { selfApprovalAllowed } from '~~/layers/pam/server/utils/pamPolicy'

/**
 * Approve an access request at the caller's level. Enforces no self-approval
 * (unless the policy explicitly allows it), records the decision, and — when
 * all levels are satisfied — approves the request and issues grants.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.request.approve')
  const id = getRouterParam(event, 'id')!
  const request = await loadOr404<any>('pam.access_requests', id, 'Request not found')
  if (request.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `Request is ${request.status}` })
  const body = await readBody(event).catch(() => ({}))

  const accountIds = (await getPamDb().query('SELECT account_id FROM pam.request_accounts WHERE request_id=$1', [id])).rows.map((r) => r.account_id)
  const policy = await resolveRequestPolicy(accountIds)
  if (!selfApprovalAllowed(request.requester, user.username, policy.allowSelfApproval)) {
    await pamAudit(event, user, { action: 'request.approve.denied', objectType: 'request', objectId: id, severity: 'high', result: 'denied', reason: 'self-approval not permitted' })
    throw createError({ statusCode: 403, statusMessage: 'You cannot approve your own request' })
  }

  const db = getPamDb()
  // Take the lowest pending approval slot at the current level.
  const { rows: pending } = await db.query(
    "SELECT id FROM pam.request_approvals WHERE request_id=$1 AND decision='pending' ORDER BY level ASC, created_at ASC LIMIT 1",
    [id]
  )
  if (!pending.length) throw createError({ statusCode: 409, statusMessage: 'No pending approval slot for this request' })
  await db.query("UPDATE pam.request_approvals SET decision='approved', approver=$2, comment=$3, decided_at=$4 WHERE id=$1",
    [pending[0].id, user.username, String(body?.comment || '') || null, nowIso()])

  const outcome = await finalizeIfApproved(id, policy.approvalType, user.username, db)
  await pamAudit(event, user, { action: 'request.approve', objectType: 'request', objectId: id, severity: 'notice', details: { outcome } })
  return { status: outcome }
})
