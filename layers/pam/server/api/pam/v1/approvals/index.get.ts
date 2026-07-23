import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** The caller's pending-approval queue (requests awaiting a decision). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.request.approve')
  const { rows } = await getPamDb().query(
    `SELECT r.id, r.requester, r.action, r.reason, r.emergency, r.created_at, r.current_level,
            r.ticket_system, r.ticket_number,
            (SELECT count(*)::int FROM pam.request_accounts ra WHERE ra.request_id=r.id) AS account_count,
            (SELECT count(*)::int FROM pam.request_approvals ap WHERE ap.request_id=r.id AND ap.decision='pending') AS pending_levels
       FROM pam.access_requests r
      WHERE r.status='pending'
        AND EXISTS (SELECT 1 FROM pam.request_approvals ap WHERE ap.request_id=r.id AND ap.decision='pending')
      ORDER BY r.emergency DESC, r.created_at ASC
      LIMIT 200`
  )
  return rows
})
