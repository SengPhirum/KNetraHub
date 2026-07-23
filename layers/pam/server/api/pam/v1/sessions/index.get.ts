import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** List sessions. Viewers see their own; monitors see all. `?active=true` filters live. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const q = getQuery(event)
  const seeAll = tierGrantsPermission('pam', tier, 'pam.session.monitor')
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (!seeAll) { where.push(`lower(s.principal) = lower($${i++})`); params.push(user.username) }
  if (q.active === 'true') where.push(`s.state IN ('starting','active','idle')`)
  else if (q.state) { where.push(`s.state = $${i++}`); params.push(String(q.state)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await db.query(
    `SELECT s.id, s.principal, s.target, s.protocol, s.state, s.idle, s.emergency, s.risk_score,
            s.recording_status, s.source_ip, s.started_at, s.last_activity_at, s.ended_at,
            s.termination_reason, s.command_count, a.name AS account_name, a.username AS account_username
       FROM pam.sessions s LEFT JOIN pam.accounts a ON a.id = s.account_id
      ${whereSql}
      ORDER BY s.started_at DESC LIMIT 200`,
    params
  )
  return rows
})
