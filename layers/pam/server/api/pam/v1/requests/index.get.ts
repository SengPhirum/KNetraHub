import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** List access requests. Viewers see their own; approvers/admins see all. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const q = getQuery(event)
  const seeAll = tierGrantsPermission('pam', tier, 'pam.request.approve')
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (!seeAll || q.mine === 'true') { where.push(`lower(r.requester) = lower($${i++})`); params.push(user.username) }
  if (q.status) { where.push(`r.status = $${i++}`); params.push(String(q.status)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await db.query(
    `SELECT r.*, (SELECT count(*)::int FROM pam.request_accounts ra WHERE ra.request_id=r.id) AS account_count
       FROM pam.access_requests r ${whereSql}
      ORDER BY r.created_at DESC LIMIT 200`,
    params
  )
  return rows
})
