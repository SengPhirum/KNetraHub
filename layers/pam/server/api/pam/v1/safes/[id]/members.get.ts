import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, isSafeMember, loadOr404 } from '~~/layers/pam/server/utils/pamStore'

/** List a safe's members and their granular permissions. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  await loadOr404('pam.safes', id, 'Safe not found')
  if (!(await isSafeMember(user, tier, id))) throw createError({ statusCode: 403, statusMessage: 'Not a member of this safe' })
  const db = getPamDb()
  const { rows } = await db.query(
    `SELECT m.*, COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
       FROM pam.safe_members m
       LEFT JOIN pam.safe_member_permissions p ON p.member_id = m.id
      WHERE m.safe_id = $1
      GROUP BY m.id
      ORDER BY m.principal_type, m.principal_name`,
    [id]
  )
  return rows
})
