import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { createRule } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const body = await readBody(event)
  if (!String(body?.name || '').trim()) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  const id = await createRule({
    name: body.name, priority: body.priority, conditions: body.conditions, action: body.action,
    assignSafeId: body.assign_safe_id, assignPlatformId: body.assign_platform_id, assignOwner: body.assign_owner,
    assignTags: body.assign_tags, autoManage: body.auto_manage, triggerReconcile: body.trigger_reconcile,
    createApproval: body.create_approval, ignoreReason: body.ignore_reason, enabled: body.enabled, createdBy: user.username
  })
  await pamAudit(event, user, { action: 'discovery.rule.create', objectType: 'onboarding_rule', objectId: id, severity: 'notice', details: { name: body.name } })
  return { id }
})
