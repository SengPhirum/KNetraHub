import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'

/** The requester cancels their own pending request. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const request = await loadOr404<any>('pam.access_requests', id, 'Request not found')
  if (request.requester.toLowerCase() !== user.username.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: 'Only the requester can cancel this request' })
  }
  if (request.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `Request is ${request.status}` })
  await getPamDb().query("UPDATE pam.access_requests SET status='cancelled', decided_at=$2, updated_at=$2 WHERE id=$1", [id, nowIso()])
  await pamAudit(event, user, { action: 'request.cancel', objectType: 'request', objectId: id })
  return { status: 'cancelled' }
})
