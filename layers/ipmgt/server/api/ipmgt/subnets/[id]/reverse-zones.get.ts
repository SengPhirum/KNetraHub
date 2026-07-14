import { requireIpam, loadSubnet } from '~~/layers/ipmgt/server/utils/ipamStore'
import { reverseZonesForCidr } from '~~/layers/ipmgt/server/utils/ipamDns'

// Reverse DNS zone(s) that cover this subnet - computed, not fetched from a
// live DNS server (see ipamDns.ts for why).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  return reverseZonesForCidr(subnet.network)
})
