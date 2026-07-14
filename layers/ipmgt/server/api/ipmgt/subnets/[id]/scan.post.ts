import { requireIpam, ipamAudit, loadSubnet } from '~~/layers/ipmgt/server/utils/ipamStore'
import { scanSubnet } from '~~/layers/ipmgt/server/utils/ipamScan'

// Run a host-status/discovery scan against one subnet immediately, regardless
// of the scheduled interval. Requires ping_enabled or scan_enabled - a
// subnet with neither has nothing for a scan to do.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  if (!subnet.ping_enabled && !subnet.scan_enabled) {
    throw createError({ statusCode: 409, statusMessage: `Subnet ${subnet.network} has neither ping nor discovery scanning enabled` })
  }

  const cfg = useRuntimeConfig().ipmgt as { scanConcurrency: number; pingTimeoutSeconds: number }
  const report = await scanSubnet(subnet, {
    concurrency: cfg.scanConcurrency || 16,
    pingTimeoutSeconds: cfg.pingTimeoutSeconds || 2,
    trigger: 'manual',
    actor: user.username
  })
  await ipamAudit(user, 'ipmgt.subnet.scan', id, { network: subnet.network, ...report })
  return report
})
