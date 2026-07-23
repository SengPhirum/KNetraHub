import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, accessibleSafeIds } from '~~/layers/pam/server/utils/pamStore'

/**
 * List privileged accounts, scoped to the safes the caller can see. Supports
 * filters (safe, type, status, text), sorting and pagination. Credentials are
 * NEVER included — only metadata and a boolean current_version presence.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const q = getQuery(event)
  const safeIds = await accessibleSafeIds(user, tier)

  const where: string[] = ['a.deleted_at IS NULL']
  const params: any[] = []
  let i = 1
  if (safeIds !== null) {
    if (!safeIds.length) return { items: [], total: 0 }
    where.push(`a.safe_id = ANY($${i++}::text[])`); params.push(safeIds)
  }
  if (q.safeId) { where.push(`a.safe_id = $${i++}`); params.push(String(q.safeId)) }
  if (q.type) { where.push(`a.account_type = $${i++}`); params.push(String(q.type)) }
  if (q.status) { where.push(`a.rotation_status = $${i++}`); params.push(String(q.status)) }
  if (q.q) {
    where.push(`(lower(a.name) LIKE $${i} OR lower(a.username) LIKE $${i} OR lower(COALESCE(a.address,'')) LIKE $${i})`)
    params.push(`%${String(q.q).toLowerCase()}%`); i++
  }
  const whereSql = where.join(' AND ')

  const sortCol = ['name', 'username', 'account_type', 'criticality', 'last_used', 'next_rotation_at', 'risk_score'].includes(String(q.sort)) ? String(q.sort) : 'name'
  const dir = String(q.dir) === 'desc' ? 'DESC' : 'ASC'
  const limit = Math.min(Number(q.limit) || 50, 200)
  const offset = Math.max(Number(q.offset) || 0, 0)

  const total = Number((await db.query(`SELECT count(*)::int c FROM pam.accounts a WHERE ${whereSql}`, params)).rows[0].c)
  const { rows } = await db.query(
    `SELECT a.id, a.name, a.username, a.address, a.port, a.safe_id, a.platform_id, a.environment,
            a.owner, a.account_type, a.privilege_level, a.criticality, a.rotation_status, a.auto_managed,
            a.last_verified, a.last_changed, a.last_used, a.next_rotation_at, a.checkout_state,
            a.risk_score, a.enabled, a.discovery_source, a.current_credential_version,
            (a.current_credential_version IS NOT NULL) AS has_credential,
            s.name AS safe_name, p.name AS platform_name
       FROM pam.accounts a
       LEFT JOIN pam.safes s ON s.id = a.safe_id
       LEFT JOIN pam.platforms p ON p.id = a.platform_id
      WHERE ${whereSql}
      ORDER BY a.${sortCol} ${dir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  return { items: rows, total }
})
