import { requireRole } from '~~/server/utils/auth'
import { saveAlertRule, DEFAULT_RULES } from '~~/layers/docker/server/utils/alertRules'
import type { AlertRuleType } from '~~/layers/docker/server/utils/alertRules'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const type = getRouterParam(event, 'type') as AlertRuleType
  if (!(type in DEFAULT_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const body = await readBody<{ enabled?: boolean; config?: Record<string, unknown>; template?: string }>(event)
  if (body.template !== undefined && !body.template.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Template cannot be empty' })
  }

  const rule = await saveAlertRule(type, body, user.username)
  await audit({ actor: user.username, action: 'alerts.rule.update', target: type })
  return rule
})
