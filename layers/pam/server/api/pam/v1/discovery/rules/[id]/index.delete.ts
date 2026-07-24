import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { deleteRule } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const id = getRouterParam(event, 'id')!
  await deleteRule(id)
  await pamAudit(event, user, { action: 'discovery.rule.delete', objectType: 'onboarding_rule', objectId: id, severity: 'warning' })
  return { ok: true }
})
