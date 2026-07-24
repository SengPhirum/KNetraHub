import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'
import {
  resolveRequestPolicy, finalizeIfApproved, currentPendingLevel, hasDecidedAtLevel,
  assertApproverEligible, assertNoSodConflict
} from '~~/layers/pam/server/utils/pamRequests'
import { selfApprovalAllowed } from '~~/layers/pam/server/utils/pamPolicy'

/**
 * Approve an access request at the current level. Enforces: no self-approval,
 * approver eligibility for the level's approver type (owner/safe-owner/group),
 * separation-of-duties, and DISTINCT approvers per level (so a quorum≥2 level
 * needs that many different approvers). Fills one slot at the current level and
 * finalizes only when every level's quorum is met.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.request.approve')
  const id = getRouterParam(event, 'id')!
  const request = await loadOr404<any>('pam.access_requests', id, 'Request not found')
  if (request.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `Request is ${request.status}` })
  const body = await readBody(event).catch(() => ({}))

  const db = getPamDb()
  const accountIds = (await db.query('SELECT account_id FROM pam.request_accounts WHERE request_id=$1', [id])).rows.map((r) => r.account_id)
  const policy = await resolveRequestPolicy(accountIds, db)

  // 1. No self-approval (unless the policy explicitly allows it).
  if (!selfApprovalAllowed(request.requester, user.username, policy.allowSelfApproval)) {
    await pamAudit(event, user, { action: 'request.approve.denied', objectType: 'request', objectId: id, severity: 'high', result: 'denied', reason: 'self-approval not permitted' })
    throw createError({ statusCode: 403, statusMessage: 'You cannot approve your own request' })
  }

  // 2. Sequential gate: only the current (lowest pending) level may be approved.
  const level = await currentPendingLevel(id, db)
  if (level === null) throw createError({ statusCode: 409, statusMessage: 'No pending approval slot for this request' })
  const levelDef = policy.levels.find((l) => l.level === level) || { level, approverType: 'manager', approverRef: null, quorum: 1 }

  // 3. Distinct approver per level (quorum requires that many DIFFERENT people).
  if (await hasDecidedAtLevel(id, level, user.username, db)) {
    throw createError({ statusCode: 409, statusMessage: 'You have already approved this level' })
  }
  // 4. Eligibility for this level's approver type + separation of duties.
  await assertApproverEligible(user, tier, levelDef, accountIds, db)
  await assertNoSodConflict(policy, request, user, accountIds, db)

  // 5. Fill one pending slot at the current level.
  const { rows: slot } = await db.query(
    "SELECT id FROM pam.request_approvals WHERE request_id=$1 AND level=$2 AND decision='pending' ORDER BY created_at ASC LIMIT 1",
    [id, level]
  )
  if (!slot.length) throw createError({ statusCode: 409, statusMessage: 'No pending slot at this level' })
  await db.query("UPDATE pam.request_approvals SET decision='approved', approver=$2, approver_type=$3, comment=$4, decided_at=$5 WHERE id=$1",
    [slot[0].id, user.username, levelDef.approverType, String(body?.comment || '') || null, nowIso()])

  const outcome = await finalizeIfApproved(id, policy, user.username, db)
  await pamAudit(event, user, { action: 'request.approve', objectType: 'request', objectId: id, severity: 'notice', details: { level, outcome } })
  return { status: outcome, level }
})
