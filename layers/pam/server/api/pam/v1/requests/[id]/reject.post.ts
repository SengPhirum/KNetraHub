import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { pamNotify } from '~~/layers/pam/server/utils/pamNotify'

/** Reject an access request. A rejection is final and never becomes break-glass. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.request.approve')
  const id = getRouterParam(event, 'id')!
  const request = await loadOr404<any>('pam.access_requests', id, 'Request not found')
  if (request.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `Request is ${request.status}` })
  const body = await readBody(event).catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A rejection reason is required' })

  const db = getPamDb()
  const now = nowIso()
  await db.query(
    "UPDATE pam.request_approvals SET decision='rejected', approver=$2, comment=$3, decided_at=$4 WHERE request_id=$1 AND decision='pending'",
    [id, user.username, reason, now]
  )
  await db.query("UPDATE pam.access_requests SET status='rejected', decision_reason=$2, decided_at=$3, updated_at=$3 WHERE id=$1", [id, reason, now])
  await pamAudit(event, user, { action: 'request.reject', objectType: 'request', objectId: id, severity: 'notice', reason })
  await pamNotify({ severity: 'info', event: 'request.rejected', title: 'Access request rejected', body: `Request ${id.slice(0, 8)} was rejected.`, objectType: 'request', objectId: id, link: `/pam/requests/${id}` }, db).catch(() => {})
  return { status: 'rejected' }
})
