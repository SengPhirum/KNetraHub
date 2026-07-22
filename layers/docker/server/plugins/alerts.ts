import { useDocker } from '~~/layers/docker/server/utils/docker'
import { getDockerDb as getDb, isModuleEnabled } from '~~/server/utils/moduleDb'
import { logSystem } from '~~/server/utils/moduleLogs'
import { getAgentReport } from '~~/layers/docker/server/utils/agentReports'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
import { getAlertRule } from '~~/layers/docker/server/utils/alertRules'
import { latestServiceUsageRows, nodeCapacityById, type UsageRow } from '~~/layers/docker/server/api/services/usage.get'

// Polls for the threshold/health-style alert conditions (usage, node down,
// replicas degraded, service down/recovered, disk usage). The event-style
// rules (deploy_failed, stack_deployed/removed, service_redeployed/scaled/
// image_updated) are fired inline from their mutation endpoints, and the
// task-lifecycle rules (task_failed/task_shutdown) from serviceEvents.ts's
// task poller. Mirrors autoredeploy.ts's self-rescheduling setTimeout
// pattern, and serviceEvents.ts's transition-tracking + first-poll-skip
// pattern so a continuously-true condition only fires once per rising edge,
// not every tick.
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  const cfg = useRuntimeConfig().alerts
  if (!cfg.enabled) return
  pollAlerts()
})

// Keyed `${ruleType}:${targetId}` (or `${ruleType}:cpu:${id}` /
// `:mem:${id}` for the two independently-toggleable usage checks) -> true
// once the alert has fired for the current rising edge. Shared across all 4
// polled checks since the rule-type prefix makes every key globally unique.
const activeAlerts = new Map<string, boolean>()
// Side state for replicas_degraded's grace period - "when did this service
// first become under-replicated" - paired with activeAlerts by the same key.
const degradedSince = new Map<string, number>()
// Same idea for service_down's grace period, keyed `service_down:${id}`.
const downSince = new Map<string, number>()
let firstPoll = true

async function pollAlerts() {
  const cfg = useRuntimeConfig().alerts
  try {
    if (!(await isModuleEnabled('docker'))) return
    const seenKeys = new Set<string>()
    await Promise.allSettled([
      checkUsageThreshold(seenKeys),
      checkNodeDown(seenKeys),
      checkReplicasDegraded(seenKeys),
      checkServiceDown(seenKeys),
      checkDiskUsageThreshold(seenKeys)
    ])
    // Evict keys for services/nodes that no longer exist so the maps don't
    // grow unboundedly over the life of the process.
    for (const key of activeAlerts.keys()) {
      if (!seenKeys.has(key)) activeAlerts.delete(key)
    }
    for (const key of degradedSince.keys()) {
      if (!seenKeys.has(key)) degradedSince.delete(key)
    }
    for (const key of downSince.keys()) {
      if (!seenKeys.has(key)) downSince.delete(key)
    }
    firstPoll = false
  } catch (err: any) {
    // one fully-failed tick (e.g. docker/db unreachable) - try again next tick
    await logSystem('docker', 'debug', 'alerts.poll.failed', String(err?.message || err))
  } finally {
    setTimeout(pollAlerts, cfg.intervalMinutes * 60_000)
  }
}

/** Returns true exactly once per false->true rising edge; never on the first poll after boot. */
function transitioned(key: string, isActive: boolean, seenKeys: Set<string>): boolean {
  seenKeys.add(key)
  const was = activeAlerts.get(key) || false
  activeAlerts.set(key, isActive)
  if (!isActive) return false
  if (was) return false
  if (firstPoll) return false
  return true
}

async function checkUsageThreshold(seenKeys: Set<string>) {
  const rule = await getAlertRule('usage_threshold')
  if (!rule.enabled) return

  const docker = useDocker()
  const [services, rowsByService, nodeCapacity] = await Promise.all([
    docker.listServices().catch(() => []),
    latestServiceUsageRows(),
    nodeCapacityById()
  ])
  const serviceById = new Map((services as any[]).map((s) => [s.ID, s]))

  for (const [serviceId, rows] of rowsByService) {
    const svc = serviceById.get(serviceId)
    const name = svc?.Spec?.Name || serviceId
    let cpuPercent = 0
    let memoryUsedBytes = 0
    let memoryLimitBytes = 0
    const nodeIds = new Set<string>()
    for (const r of rows as UsageRow[]) {
      cpuPercent += r.cpuPercent
      memoryUsedBytes += r.memoryUsed
      memoryLimitBytes += r.memoryLimit
      if (r.nodeId) nodeIds.add(r.nodeId)
    }
    let nodeCpuNanos = 0
    let nodeMemoryBytes = 0
    for (const nodeId of nodeIds) {
      const cap = nodeCapacity.get(nodeId)
      if (cap) {
        nodeCpuNanos += cap.cpuNanos
        nodeMemoryBytes += cap.memoryBytes
      }
    }

    // Ceiling: configured limit/reservation wins, else node capacity, else
    // (memory only) the cgroup-reported limit - same precedence as the
    // service detail/list pages' display logic.
    const resources = svc?.Spec?.TaskTemplate?.Resources || {}
    const cpuCeilingNano = resources.Limits?.NanoCPUs || resources.Reservations?.NanoCPUs || nodeCpuNanos || 0
    const memCeilingBytes = resources.Limits?.MemoryBytes || resources.Reservations?.MemoryBytes || nodeMemoryBytes || memoryLimitBytes || 0

    const cpuCeilingPercent = cpuCeilingNano ? (cpuPercent / 100 / (cpuCeilingNano / 1e9)) * 100 : 0
    const memPercent = memCeilingBytes ? (memoryUsedBytes / memCeilingBytes) * 100 : 0

    const vars = {
      target: name,
      cpuPercent: cpuCeilingPercent.toFixed(1),
      memoryPercent: memPercent.toFixed(1),
      cpuThreshold: String(rule.config.cpuPercent),
      memoryThreshold: String(rule.config.memoryPercent),
      time: new Date().toISOString()
    }

    if (rule.config.cpuEnabled !== false && cpuCeilingNano) {
      const key = `usage_threshold:cpu:${serviceId}`
      if (transitioned(key, cpuCeilingPercent >= rule.config.cpuPercent, seenKeys)) {
        await fireAlert({ ruleType: 'usage_threshold', target: name, severity: 'warning', vars })
      }
    }
    if (rule.config.memoryEnabled !== false && memCeilingBytes) {
      const key = `usage_threshold:mem:${serviceId}`
      if (transitioned(key, memPercent >= rule.config.memoryPercent, seenKeys)) {
        await fireAlert({ ruleType: 'usage_threshold', target: name, severity: 'warning', vars })
      }
    }
  }
}

async function checkNodeDown(seenKeys: Set<string>) {
  const rule = await getAlertRule('node_down')
  if (!rule.enabled) return

  const staleAfterMs = useRuntimeConfig().agent.staleAfterMs
  const nodes = await useDocker().listNodes().catch(() => [])
  for (const node of nodes as any[]) {
    const report = getAgentReport(node.ID)
    if (!report) continue // never reported - not a "went down" transition, out of scope

    const key = `node_down:${node.ID}`
    const isStale = Date.now() - report.receivedAt > staleAfterMs
    if (transitioned(key, isStale, seenKeys)) {
      const target = node.Description?.Hostname || node.ID
      await fireAlert({
        ruleType: 'node_down',
        target,
        severity: 'critical',
        vars: { target, lastSeen: new Date(report.receivedAt).toISOString(), time: new Date().toISOString() }
      })
    }
  }
}

async function checkReplicasDegraded(seenKeys: Set<string>) {
  const rule = await getAlertRule('replicas_degraded')
  if (!rule.enabled) return

  const docker = useDocker()
  const [services, tasks] = await Promise.all([docker.listServices().catch(() => []), docker.listTasks().catch(() => [])])
  const runningByService = new Map<string, number>()
  for (const t of tasks as any[]) {
    if (t.Status?.State === 'running' && t.ServiceID) runningByService.set(t.ServiceID, (runningByService.get(t.ServiceID) || 0) + 1)
  }

  for (const svc of services as any[]) {
    if (svc.Spec?.Mode?.Global) continue // out of scope for v1 - "desired" for global is a different calculation
    const desired = svc.Spec?.Mode?.Replicated?.Replicas
    if (desired == null) continue
    const running = runningByService.get(svc.ID) || 0
    const key = `replicas_degraded:${svc.ID}`
    const degraded = running < desired

    if (!degraded) {
      degradedSince.delete(key)
      transitioned(key, false, seenKeys) // clears state + marks seen, never fires
      continue
    }

    const since = degradedSince.get(key) ?? Date.now()
    degradedSince.set(key, since)
    const pastGrace = Date.now() - since >= rule.config.gracePeriodMinutes * 60_000
    if (transitioned(key, pastGrace, seenKeys)) {
      const target = svc.Spec?.Name || svc.ID
      await fireAlert({
        ruleType: 'replicas_degraded',
        target,
        severity: 'warning',
        vars: { target, running: String(running), desired: String(desired), gracePeriodMinutes: String(rule.config.gracePeriodMinutes), time: new Date().toISOString() }
      })
    }
  }
}

// Full outage (0 running while >0 desired) - stricter sibling of
// replicas_degraded, with its own grace period so stop-first update orders
// and brief restarts don't page anyone. Also fires service_recovered on the
// falling edge, but only for services that actually alerted as down.
async function checkServiceDown(seenKeys: Set<string>) {
  const [rule, recoveredRule] = await Promise.all([getAlertRule('service_down'), getAlertRule('service_recovered')])
  if (!rule.enabled && !recoveredRule.enabled) return

  const docker = useDocker()
  const [services, tasks] = await Promise.all([docker.listServices().catch(() => []), docker.listTasks().catch(() => [])])
  const runningByService = new Map<string, number>()
  const desiredGlobalByService = new Map<string, number>()
  for (const t of tasks as any[]) {
    if (!t.ServiceID) continue
    if (t.Status?.State === 'running') runningByService.set(t.ServiceID, (runningByService.get(t.ServiceID) || 0) + 1)
    if (t.DesiredState === 'running') desiredGlobalByService.set(t.ServiceID, (desiredGlobalByService.get(t.ServiceID) || 0) + 1)
  }

  for (const svc of services as any[]) {
    // Global services have no Replicas in the spec - "desired" is however
    // many tasks the orchestrator currently wants running.
    const desired = svc.Spec?.Mode?.Global
      ? desiredGlobalByService.get(svc.ID) || 0
      : svc.Spec?.Mode?.Replicated?.Replicas
    if (!desired) continue
    const running = runningByService.get(svc.ID) || 0
    const key = `service_down:${svc.ID}`
    const isDown = running === 0
    const target = svc.Spec?.Name || svc.ID
    const wasAlerted = activeAlerts.get(key) || false

    if (!isDown) {
      downSince.delete(key)
      transitioned(key, false, seenKeys) // clears state + marks seen, never fires
      if (wasAlerted && !firstPoll && recoveredRule.enabled) {
        await fireAlert({
          ruleType: 'service_recovered',
          target,
          severity: 'info',
          vars: { target, running: String(running), desired: String(desired), time: new Date().toISOString() }
        })
      }
      continue
    }

    const since = downSince.get(key) ?? Date.now()
    downSince.set(key, since)
    const pastGrace = Date.now() - since >= rule.config.gracePeriodMinutes * 60_000
    if (transitioned(key, pastGrace, seenKeys) && rule.enabled) {
      await fireAlert({
        ruleType: 'service_down',
        target,
        severity: 'critical',
        vars: { target, desired: String(desired), gracePeriodMinutes: String(rule.config.gracePeriodMinutes), time: new Date().toISOString() }
      })
    }
  }
}

async function checkDiskUsageThreshold(seenKeys: Set<string>) {
  const rule = await getAlertRule('disk_usage_threshold')
  if (!rule.enabled) return

  const [{ rows }, nodes] = await Promise.all([
    getDb().query(
      `SELECT DISTINCT ON (node_id) node_id, percent
       FROM disk_usage
       WHERE time > now() - interval '15 minutes'
       ORDER BY node_id, time DESC`
    ).catch(() => ({ rows: [] as any[] })),
    useDocker().listNodes().catch(() => [])
  ])
  const hostnameById = new Map((nodes as any[]).map((n) => [n.ID, n.Description?.Hostname || n.ID]))

  for (const row of rows as any[]) {
    const percent = Number(row.percent || 0)
    const key = `disk_usage_threshold:${row.node_id}`
    if (transitioned(key, percent >= rule.config.percent, seenKeys)) {
      const target = hostnameById.get(row.node_id) || row.node_id
      await fireAlert({
        ruleType: 'disk_usage_threshold',
        target,
        severity: 'warning',
        vars: { target, percent: percent.toFixed(1), threshold: String(rule.config.percent), time: new Date().toISOString() }
      })
    }
  }
}
