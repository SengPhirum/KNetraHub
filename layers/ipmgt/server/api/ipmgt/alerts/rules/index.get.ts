import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getAllIpamAlertRules } from '~~/layers/ipmgt/server/utils/ipamAlertRules'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'manager')
  return getAllIpamAlertRules()
})
