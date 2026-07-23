import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, assertSafePermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'

/** Remove a safe member (requires manage_members). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const memberId = getRouterParam(event, 'memberId')!
  await assertSafePermission(user, tier, id, 'manage_members')
  const db = getPamDb()
  const { rowCount } = await db.query('DELETE FROM pam.safe_members WHERE id=$1 AND safe_id=$2', [memberId, id])
  if (!rowCount) throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  await pamAudit(event, user, { action: 'safe.member.remove', objectType: 'safe', objectId: id, safeId: id, severity: 'notice', details: { memberId } })
  return { ok: true }
})
