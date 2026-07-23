import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** Access request detail: accounts, approvals, tickets, grants and timeline. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const request = await loadOr404<any>('pam.access_requests', id, 'Request not found')
  const isApprover = tierGrantsPermission('pam', tier, 'pam.request.approve')
  if (request.requester.toLowerCase() !== user.username.toLowerCase() && !isApprover) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot view this request' })
  }
  const db = getPamDb()
  const [accounts, approvals, tickets, grants] = await Promise.all([
    db.query('SELECT a.id, a.name, a.username, a.address, a.safe_id, s.name AS safe_name FROM pam.request_accounts ra JOIN pam.accounts a ON a.id=ra.account_id LEFT JOIN pam.safes s ON s.id=a.safe_id WHERE ra.request_id=$1', [id]),
    db.query('SELECT * FROM pam.request_approvals WHERE request_id=$1 ORDER BY level, created_at', [id]),
    db.query('SELECT * FROM pam.request_tickets WHERE request_id=$1 ORDER BY created_at', [id]),
    db.query('SELECT id, account_id, status, starts_at, expires_at, use_count FROM pam.access_grants WHERE request_id=$1', [id])
  ])
  return { request, accounts: accounts.rows, approvals: approvals.rows, tickets: tickets.rows, grants: grants.rows }
})
