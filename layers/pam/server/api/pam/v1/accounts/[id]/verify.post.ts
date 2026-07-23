import { requirePamPermission, resolveSafePermissions, pamAudit, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'

/** Queue a credential verification (operator: pam.account.rotate + initiate_verification). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.account.rotate')
  const id = getRouterParam(event, 'id')!
  const account = await loadOr404<any>('pam.accounts', id, 'Account not found')
  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!perms.has('initiate_verification')) throw createError({ statusCode: 403, statusMessage: 'You cannot verify credentials in this safe' })

  const { id: jobId, deduped } = await enqueueJob({
    jobType: 'verify', accountId: id, safeId: account.safe_id, platformId: account.platform_id,
    trigger: 'manual', createdBy: user.username, priority: 40
  })
  await pamAudit(event, user, { action: 'account.verify.request', objectType: 'account', objectId: id, safeId: account.safe_id, details: { jobId } })
  return { jobId, queued: !deduped }
})
