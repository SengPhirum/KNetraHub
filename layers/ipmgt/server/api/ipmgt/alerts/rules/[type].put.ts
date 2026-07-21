import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { saveIpamAlertRule, DEFAULT_IPAM_RULES, type IpamAlertRuleType } from '~~/layers/ipmgt/server/utils/ipamAlertRules'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const type = getRouterParam(event, 'type') as IpamAlertRuleType
  if (!(type in DEFAULT_IPAM_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const body = await readBody<{ enabled?: boolean; config?: Record<string, unknown>; template?: string }>(event)
  if (body.template !== undefined && !body.template.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Template cannot be empty' })
  }

  const rule = await saveIpamAlertRule(type, body, user.username)
  await ipamAudit(user, 'ipmgt.alert.rule.update', type)
  return rule
})
