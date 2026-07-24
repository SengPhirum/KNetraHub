import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { deletePolicy } from '~~/layers/pam/server/utils/pamPolicyStore'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.policy.manage')
  const id = getRouterParam(event, 'id')!
  await deletePolicy(id)
  await pamAudit(event, user, { action: 'policy.delete', objectType: 'access_policy', objectId: id, severity: 'warning' })
  return { ok: true }
})
