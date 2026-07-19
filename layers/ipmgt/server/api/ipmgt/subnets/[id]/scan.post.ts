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

  // Manual scans report discovered hosts back (with reverse-DNS hostnames)
  // instead of auto-saving them - the user confirms via add-discovered.
  const cfg = useRuntimeConfig().ipmgt as { scanConcurrency: number; pingTimeoutSeconds: number }
  const report = await scanSubnet(subnet, {
    concurrency: cfg.scanConcurrency || 16,
    pingTimeoutSeconds: cfg.pingTimeoutSeconds || 2,
    trigger: 'manual',
    actor: user.username,
    discoverMode: 'report'
  })
  const { discovered, ...stats } = report
  await ipamAudit(user, 'ipmgt.subnet.scan', id, { network: subnet.network, ...stats })
  return report
})
