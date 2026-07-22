import { requireRole } from '~~/server/utils/auth'
import { resetAlertRule, DEFAULT_RULES } from '~~/layers/docker/server/utils/alertRules'
import type { AlertRuleType } from '~~/layers/docker/server/utils/alertRules'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const type = getRouterParam(event, 'type') as AlertRuleType
  if (!(type in DEFAULT_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const rule = await resetAlertRule(type, user.username)
  await audit({ actor: user.username, action: 'alerts.rule.reset', target: type })
  return rule
})
