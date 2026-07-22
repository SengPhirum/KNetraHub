import { requireRole } from '~~/server/utils/auth'
import { savePortalAlertRule, DEFAULT_PORTAL_RULES, type PortalAlertRuleType } from '~~/server/utils/portalAlertRules'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const type = getRouterParam(event, 'type') as PortalAlertRuleType
  if (!(type in DEFAULT_PORTAL_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const body = await readBody<{ enabled?: boolean; config?: Record<string, unknown>; template?: string }>(event)
  if (body.template !== undefined && !body.template.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Template cannot be empty' })
  }

  const rule = await savePortalAlertRule(type, body, user.username)
  await audit({ actor: user.username, action: 'portal.alert.rule.update', target: type })
  return rule
})
