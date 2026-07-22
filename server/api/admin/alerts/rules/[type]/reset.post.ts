import { requireRole } from '~~/server/utils/auth'
import { resetPortalAlertRule, DEFAULT_PORTAL_RULES, type PortalAlertRuleType } from '~~/server/utils/portalAlertRules'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const type = getRouterParam(event, 'type') as PortalAlertRuleType
  if (!(type in DEFAULT_PORTAL_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const rule = await resetPortalAlertRule(type, user.username)
  await audit({ actor: user.username, action: 'portal.alert.rule.reset', target: type })
  return rule
})
