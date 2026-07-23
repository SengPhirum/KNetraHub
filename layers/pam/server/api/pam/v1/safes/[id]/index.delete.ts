import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, assertSafePermission, pamAudit, loadOr404, nowIso, newId } from '~~/layers/pam/server/utils/pamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

/**
 * Soft-delete a safe (recoverable). Requires admin tier + manage_safe on the
 * safe + a step-up security-password confirmation. A safe holding accounts
 * cannot be deleted until they are moved/removed. Critical safes flagged for
 * dual control require a second confirming header (x-pam-dual-approver).
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.safe.manage')
  const id = getRouterParam(event, 'id')!
  const safe = await loadOr404<any>('pam.safes', id, 'Safe not found')
  await assertSafePermission(user, tier, id, 'manage_safe')
  await requirePasswordConfirm(event)

  const db = getPamDb()
  const { rows: acct } = await db.query('SELECT count(*)::int c FROM pam.accounts WHERE safe_id=$1 AND deleted_at IS NULL', [id])
  if (Number(acct[0].c) > 0) {
    throw createError({ statusCode: 409, statusMessage: `Safe still holds ${acct[0].c} account(s). Move or delete them first.` })
  }
  if (safe.require_dual_control || safe.criticality === 'critical') {
    const dual = getRequestHeader(event, 'x-pam-dual-approver')
    if (!dual || dual.toLowerCase() === user.username.toLowerCase()) {
      throw createError({ statusCode: 428, statusMessage: 'This critical safe requires dual authorization: a second approver must be named in x-pam-dual-approver.' })
    }
  }

  const now = nowIso()
  await db.query('UPDATE pam.safes SET deleted_at=$2, status=\'archived\', updated_by=$3 WHERE id=$1', [id, now, user.username])
  await db.query(
    `INSERT INTO pam.deleted_objects (id, object_type, object_id, safe_id, payload, deleted_at, deleted_by, purge_after)
     VALUES ($1,'safe',$2,$2,$3,$4,$5,$6)`,
    [newId(), id, JSON.stringify({ name: safe.name, slug: safe.slug }), now, user.username,
      new Date(Date.now() + (Number(safe.retention_days) || 365) * 86_400_000).toISOString()]
  )
  await pamAudit(event, user, { action: 'safe.delete', objectType: 'safe', objectId: id, safeId: id, severity: 'high', result: 'success' })
  return { ok: true }
})
