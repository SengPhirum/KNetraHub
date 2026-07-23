import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'

/** Queue a credential rotation (operator: pam.account.rotate + initiate_rotation). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.account.rotate')
  const id = getRouterParam(event, 'id')!
  const account = await loadOr404<any>('pam.accounts', id, 'Account not found')
  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!perms.has('initiate_rotation')) throw createError({ statusCode: 403, statusMessage: 'You cannot rotate credentials in this safe' })

  const { id: jobId, deduped } = await enqueueJob({
    jobType: 'rotate', accountId: id, safeId: account.safe_id, platformId: account.platform_id,
    trigger: 'manual', createdBy: user.username, priority: 50
  })
  await getPamDb().query("UPDATE pam.accounts SET rotation_status='pending' WHERE id=$1 AND rotation_status='unmanaged'", [id])
  await pamAudit(event, user, { action: 'account.rotate.request', objectType: 'account', objectId: id, safeId: account.safe_id, severity: 'notice', details: { jobId } })
  return { jobId, queued: !deduped }
})
