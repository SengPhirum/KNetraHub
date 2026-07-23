import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, resolveSafePermissions, isSafeMember, loadOr404 } from '~~/layers/pam/server/utils/pamStore'

/** Safe detail + the caller's resolved granular permissions on it. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const db = getPamDb()
  const safe = await loadOr404<any>('pam.safes', id, 'Safe not found')
  if (safe.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Safe not found' })
  if (!(await isSafeMember(user, tier, id))) throw createError({ statusCode: 403, statusMessage: 'Not a member of this safe' })

  const perms = [...(await resolveSafePermissions(user, tier, id))]
  const [accounts, timeline] = await Promise.all([
    db.query('SELECT count(*)::int c FROM pam.accounts WHERE safe_id=$1 AND deleted_at IS NULL', [id]),
    db.query("SELECT id, ts, actor, action, result, severity FROM pam.audit_events WHERE safe_id=$1 ORDER BY seq DESC LIMIT 25", [id])
  ])
  return { safe, myPermissions: perms, accountCount: Number(accounts.rows[0].c), timeline: timeline.rows }
})
