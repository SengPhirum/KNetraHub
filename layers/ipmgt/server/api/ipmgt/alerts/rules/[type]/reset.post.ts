import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { resetIpamAlertRule, DEFAULT_IPAM_RULES, type IpamAlertRuleType } from '~~/layers/ipmgt/server/utils/ipamAlertRules'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const type = getRouterParam(event, 'type') as IpamAlertRuleType
  if (!(type in DEFAULT_IPAM_RULES)) throw createError({ statusCode: 400, statusMessage: 'Unknown rule type' })

  const rule = await resetIpamAlertRule(type, user.username)
  await ipamAudit(user, 'ipmgt.alert.rule.reset', type)
  return rule
})
