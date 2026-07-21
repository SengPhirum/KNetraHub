import { getIpamDb as getDb, isModuleEnabled } from '~~/server/utils/moduleDb'
import { logSystem } from '~~/server/utils/moduleLogs'
import { subnetUsage, type SubnetRow } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getIpamAlertRule } from '~~/layers/ipmgt/server/utils/ipamAlertRules'
import { fireIpamAlert } from '~~/layers/ipmgt/server/utils/ipamAlertNotify'

/**
 * Polls for the threshold-style IPAM alert conditions (subnet utilization and
 * subnet-full). Mirrors the Docker alerts plugin (layers/docker/server/plugins/
 * alerts.ts): a self-rescheduling setTimeout, rising-edge tracking so a
 * continuously-true condition fires once per false→true transition rather than
 * every tick, and a first-poll skip so a restart doesn't re-alert everything.
 * The event-style rule (ip_request_submitted) is fired inline from its endpoint.
 * Shares the master alerts switch/interval with Docker (NUXT_ALERTS_*).
 */
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  const cfg = useRuntimeConfig().alerts
  if (!cfg.enabled) return
  pollIpamAlerts()
})

// Keyed `${ruleType}:${subnetId}` → true once fired for the current rising edge.
const activeAlerts = new Map<string, boolean>()
let firstPoll = true

async function pollIpamAlerts() {
  const cfg = useRuntimeConfig().alerts
  try {
    if (!(await isModuleEnabled('ipmgt'))) return
    const seenKeys = new Set<string>()
    await checkSubnets(seenKeys)
    // Evict keys for subnets that no longer exist so the map stays bounded.
    for (const key of activeAlerts.keys()) {
      if (!seenKeys.has(key)) activeAlerts.delete(key)
    }
    firstPoll = false
  } catch (err: any) {
    await logSystem('ipmgt', 'debug', 'alerts.poll.failed', String(err?.message || err))
  } finally {
    setTimeout(pollIpamAlerts, cfg.intervalMinutes * 60_000)
  }
}

/** Returns true exactly once per false→true rising edge; never on the first poll after boot. */
function transitioned(key: string, isActive: boolean, seenKeys: Set<string>): boolean {
  seenKeys.add(key)
  const was = activeAlerts.get(key) || false
  activeAlerts.set(key, isActive)
  if (!isActive) return false
  if (was) return false
  if (firstPoll) return false
  return true
}

async function checkSubnets(seenKeys: Set<string>) {
  const [utilRule, fullRule] = await Promise.all([
    getIpamAlertRule('subnet_utilization'),
    getIpamAlertRule('subnet_full')
  ])
  if (!utilRule.enabled && !fullRule.enabled) return

  const { rows } = await getDb().query('SELECT * FROM ipmgt_subnets').catch(() => ({ rows: [] as any[] }))
  for (const subnet of rows as SubnetRow[]) {
    const usage = await subnetUsage(subnet).catch(() => null)
    if (!usage || usage.capacity <= 0) continue
    const target = subnet.name ? `${subnet.name} (${subnet.network})` : subnet.network
    const time = new Date().toISOString()

    if (fullRule.enabled) {
      const key = `subnet_full:${subnet.id}`
      if (transitioned(key, usage.free === 0, seenKeys)) {
        await fireIpamAlert({
          ruleType: 'subnet_full', target, severity: 'critical',
          vars: { target, used: String(usage.used), capacity: String(usage.capacity), time }
        })
      }
    }

    if (utilRule.enabled) {
      // Don't double-fire utilization when the subnet is already full (that's
      // the stricter subnet_full alert's job).
      const threshold = Number(utilRule.config.percent) || 90
      const key = `subnet_utilization:${subnet.id}`
      const over = usage.percent >= threshold && !(fullRule.enabled && usage.free === 0)
      if (transitioned(key, over, seenKeys)) {
        await fireIpamAlert({
          ruleType: 'subnet_utilization', target, severity: 'warning',
          vars: {
            target, percent: String(usage.percent), used: String(usage.used),
            capacity: String(usage.capacity), free: String(usage.free),
            threshold: String(threshold), time
          }
        })
      }
    }
  }
}
