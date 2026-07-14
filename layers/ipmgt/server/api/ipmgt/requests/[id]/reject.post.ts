import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'manager')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_requests WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  if (cur.rows[0].status !== 'submitted') {
    throw createError({ statusCode: 409, statusMessage: `Request is already ${cur.rows[0].status}` })
  }

  const now = new Date().toISOString()
  await db.query(
    `UPDATE ipmgt_requests SET status = 'rejected', approver = $2, admin_comment = $3, decided_at = $4, updated_at = $4 WHERE id = $1`,
    [id, user.username, body?.admin_comment || null, now]
  )
  await ipamAudit(user, 'ipmgt.request.reject', id, { comment: body?.admin_comment || null })
  return { id, status: 'rejected' }
})
