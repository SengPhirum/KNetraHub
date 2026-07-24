import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { getPolicy } from '~~/layers/pam/server/utils/pamPolicyStore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.policy.view')
  const policy = await getPolicy(getRouterParam(event, 'id')!)
  if (!policy) throw createError({ statusCode: 404, statusMessage: 'Policy not found' })
  return { policy }
})
