import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** Active/expiring access grants. Viewers see their own; monitors see all. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const seeAll = tierGrantsPermission('pam', tier, 'pam.session.monitor')
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (!seeAll) { where.push(`lower(g.grantee) = lower($${i++})`); params.push(user.username) }
  if (getQuery(event).status) { where.push(`g.status = $${i++}`); params.push(String(getQuery(event).status)) }
  else where.push(`g.status = 'active'`)
  const { rows } = await db.query(
    `SELECT g.*, a.name AS account_name, a.username AS account_username, a.address
       FROM pam.access_grants g JOIN pam.accounts a ON a.id=g.account_id
      WHERE ${where.join(' AND ')}
      ORDER BY g.expires_at ASC LIMIT 200`,
    params
  )
  return rows
})
