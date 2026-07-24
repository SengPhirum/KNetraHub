import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listPolicyVersions } from '~~/layers/pam/server/utils/pamPolicyStore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.policy.view')
  return { versions: await listPolicyVersions(getRouterParam(event, 'id')!) }
})
