import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { resolveUserEntitlements } from '~~/server/utils/auth'
import { tierAtLeast } from '~~/shared/utils/entitlements'

// Cancel a still-pending request. The original requester can cancel their own
// submission; an ipmgt admin can cancel anyone's.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_requests WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  const request = cur.rows[0]
  if (request.status !== 'submitted') {
    throw createError({ statusCode: 409, statusMessage: `Request is already ${request.status}` })
  }
  if (request.requester !== user.username) {
    const apps = await resolveUserEntitlements(user)
    if (!tierAtLeast(apps.ipmgt, 'admin')) {
      throw createError({ statusCode: 403, statusMessage: 'Only the requester or an ipmgt admin can cancel this request' })
    }
  }

  await db.query(`UPDATE ipmgt_requests SET status = 'cancelled', updated_at = $2 WHERE id = $1`, [id, new Date().toISOString()])
  await ipamAudit(user, 'ipmgt.request.cancel', id, { requester: request.requester })
  return { id, status: 'cancelled' }
})
