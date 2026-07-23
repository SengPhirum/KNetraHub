import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, accessibleSafeIds } from '~~/layers/pam/server/utils/pamStore'

/** List safes the caller can see (members-only; admin sees all). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const safeIds = await accessibleSafeIds(user, tier)
  const scoped = safeIds !== null
  const { rows } = await db.query(
    `SELECT s.*,
        (SELECT count(*)::int FROM pam.accounts a WHERE a.safe_id = s.id AND a.deleted_at IS NULL) AS account_count,
        (SELECT count(*)::int FROM pam.safe_members m WHERE m.safe_id = s.id) AS member_count
       FROM pam.safes s
      WHERE s.deleted_at IS NULL ${scoped ? 'AND s.id = ANY($1::text[])' : ''}
      ORDER BY s.name ASC`,
    scoped ? [safeIds] : []
  )
  return rows
})
