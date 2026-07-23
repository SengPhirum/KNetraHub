import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

/** Soft-delete an account (admin: pam.account.delete + delete_account + step-up). Recoverable. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.account.delete')
  const id = getRouterParam(event, 'id')!
  const account = await loadOr404<any>('pam.accounts', id, 'Account not found')
  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!perms.has('delete_account')) throw createError({ statusCode: 403, statusMessage: 'You cannot delete accounts in this safe' })
  await requirePasswordConfirm(event)

  const db = getPamDb()
  const now = nowIso()
  await db.query("UPDATE pam.accounts SET deleted_at=$2, enabled=false, checkout_state='locked', updated_by=$3 WHERE id=$1", [id, now, user.username])
  await db.query(
    `INSERT INTO pam.deleted_objects (id, object_type, object_id, safe_id, payload, deleted_at, deleted_by, purge_after)
     VALUES ($1,'account',$2,$3,$4,$5,$6,$7)`,
    [newId(), id, account.safe_id, JSON.stringify({ name: account.name, username: account.username, address: account.address }),
      now, user.username, new Date(Date.now() + 90 * 86_400_000).toISOString()]
  )
  await pamAudit(event, user, { action: 'account.delete', objectType: 'account', objectId: id, safeId: account.safe_id, severity: 'high' })
  return { ok: true }
})
