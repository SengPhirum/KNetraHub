import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { updateRule } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  await updateRule(id, {
    name: body?.name, priority: body?.priority, conditions: body?.conditions, action: body?.action,
    assignSafeId: body?.assign_safe_id, assignPlatformId: body?.assign_platform_id, assignOwner: body?.assign_owner,
    assignTags: body?.assign_tags, autoManage: body?.auto_manage, triggerReconcile: body?.trigger_reconcile,
    createApproval: body?.create_approval, ignoreReason: body?.ignore_reason, enabled: body?.enabled
  })
  await pamAudit(event, user, { action: 'discovery.rule.update', objectType: 'onboarding_rule', objectId: id, severity: 'notice' })
  return { ok: true }
})
