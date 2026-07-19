import { EventEmitter } from 'node:events'
import { assertSwarm, useDocker } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { getAgentReport } from '~~/layers/docker/server/utils/agentReports'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

/**
 * Server-computed dashboard data, pushed to every connected browser tab over
 * the existing Docker SSE stream (see server/api/sse/events.get.ts) so the
 * Bridge dashboard never needs to $fetch the REST endpoints again after its
 * first load. The REST endpoints below (system/overview, nodes/usage,
 * system/metrics) call these same functions - one implementation, two
 * delivery paths (poll-once-on-load vs. push-on-change).
 */

export type DashboardPushEvent =
  | { type: 'overview'; data: Awaited<ReturnType<typeof computeOverview>> }
  | { type: 'nodeUsage'; data: Awaited<ReturnType<typeof computeNodeUsage>> }
  | { type: 'metrics'; data: Awaited<ReturnType<typeof computeMetrics>> }

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function onDashboardPush(handler: (evt: DashboardPushEvent) => void) {
  bus.on('push', handler)
  return () => bus.off('push', handler)
}

function emit(evt: DashboardPushEvent) {
  bus.emit('push', evt)
}

// ── overview: cluster/task-state summary, recomputed from live Docker API
// calls - cheap, but only worth doing when a real service/task/node/stack
// event fires, hence the debounce (a burst of events collapses to one push).
let overviewTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleOverviewPush() {
  if (overviewTimer) return
  overviewTimer = setTimeout(async () => {
    overviewTimer = null
    try { emit({ type: 'overview', data: await computeOverview() }) } catch { /* swarm/docker unreachable this cycle - skip */ }
  }, 1_500)
}

export async function computeOverview() {
  const info = await assertSwarm()
  const docker = useDocker()

  const [nodes, services, tasks, networks, volumes] = await Promise.all([
    docker.listNodes(),
    docker.listServices(),
    docker.listTasks(),
    docker.listNetworks(),
    docker.listVolumes().then((v) => v.Volumes || [])
  ])

  const stackCount = new Set(services.map((s) => s.Spec?.Labels?.[STACK_LABEL]).filter(Boolean)).size

  const nodeSummary = {
    total: nodes.length || 1,
    ready: nodes.filter((n) => n.Status?.State === 'ready').length,
    managers: nodes.filter((n) => n.Spec?.Role === 'manager').length,
    workers: nodes.filter((n) => n.Spec?.Role === 'worker').length,
    down: nodes.filter((n) => n.Status?.State !== 'ready').length
  }

  const taskStates: Record<string, number> = {}
  for (const t of tasks) {
    const s = t.Status?.State || 'unknown'
    taskStates[s] = (taskStates[s] || 0) + 1
  }

  let cpuNanos = 0
  let memBytes = 0
  for (const n of nodes) {
    cpuNanos += n.Description?.Resources?.NanoCPUs || 0
    memBytes += n.Description?.Resources?.MemoryBytes || 0
  }

  return {
    swarm: {
      id: info.Swarm?.Cluster?.ID,
      createdAt: info.Swarm?.Cluster?.CreatedAt,
      dockerVersion: info.ServerVersion
    },
    nodes: nodeSummary,
    counts: {
      services: services.length,
      tasks: tasks.length,
      runningTasks: taskStates['running'] || 0,
      networks: networks.length,
      volumes: volumes.length,
      stacks: stackCount
    },
    taskStates,
    capacity: { cpus: cpuNanos / 1e9, memoryBytes: memBytes }
  }
}

// ── nodeUsage: purely an in-memory read of the latest agent reports - no
// DB/Docker Engine round trip beyond listNodes(), so this is cheap enough to
// recompute on every agent report; still debounced since agents (one per
// node, global mode) report independently and a multi-node swarm would
// otherwise trigger one push per node every cycle.
let usageTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleNodeUsagePush() {
  if (usageTimer) return
  usageTimer = setTimeout(async () => {
    usageTimer = null
    try { emit({ type: 'nodeUsage', data: await computeNodeUsage() }) } catch { /* docker unreachable this cycle - skip */ }
  }, 2_000)
}

function emptyUsage(node: any, error: string) {
  return {
    id: node.ID,
    hostname: node.Description?.Hostname,
    available: false,
    sampledAt: new Date().toISOString(),
    error,
    cpu: { cores: 0, percent: 0 },
    memory: { usedBytes: 0, totalBytes: node.Description?.Resources?.MemoryBytes || 0, percent: 0 },
    disk: { usedBytes: 0 },
    containers: { running: 0, sampled: 0 }
  }
}

export async function computeNodeUsage() {
  const nodes = await useDocker().listNodes()
  const staleAfterMs = useRuntimeConfig().agent.staleAfterMs

  const results = nodes.map((node: any) => {
    const report = getAgentReport(node.ID)
    if (!report) return emptyUsage(node, 'Waiting for the node agent to report in')
    if (Date.now() - report.receivedAt > staleAfterMs) return emptyUsage(node, 'Node agent report is stale')

    return {
      id: node.ID,
      hostname: report.hostname || node.Description?.Hostname,
      available: true,
      sampledAt: new Date(report.receivedAt).toISOString(),
      source: 'agent',
      cpu: report.cpu,
      memory: report.memory,
      disk: report.disk,
      containers: report.containers
    }
  })

  return { sampledAt: new Date().toISOString(), nodes: results }
}

// ── metrics: bucketed Timescale history query - the heaviest of the three,
// and only meaningfully changes once new agent-reported samples land, so this
// is debounced on a much longer window than overview/nodeUsage. The Bridge
// dashboard only ever requests the 6h range (see docker/index.vue), so that's
// the only range kept warm for push; other ranges remain fetch-on-demand via
// the REST endpoint below.
const RANGES: Record<string, { lookback: string; bucket: string }> = {
  '1h': { lookback: '1 hour', bucket: '15 seconds' },
  '6h': { lookback: '6 hours', bucket: '1 minute' },
  '24h': { lookback: '24 hours', bucket: '5 minutes' },
  '7d': { lookback: '7 days', bucket: '30 minutes' }
}

let metricsTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleMetricsPush() {
  if (metricsTimer) return
  metricsTimer = setTimeout(async () => {
    metricsTimer = null
    try { emit({ type: 'metrics', data: await computeMetrics('6h') }) } catch { /* docker/db unreachable this cycle - skip */ }
  }, 30_000)
}

export async function computeMetrics(range: string) {
  const { lookback, bucket } = RANGES[range] || RANGES['6h']!

  const docker = useDocker()
  const [services, nodes] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listNodes().catch(() => [])
  ])

  const serviceNames = new Map(services.map((service: any) => [service.ID, service.Spec?.Name || service.ID]))
  const serviceReservations = new Map(services.map((service: any) => {
    const resources = service.Spec?.TaskTemplate?.Resources?.Reservations || {}
    const replicas = service.Spec?.Mode?.Replicated?.Replicas
    const desired = typeof replicas === 'number'
      ? replicas
      : service.Spec?.Mode?.Global ? nodes.length : 1
    return [service.ID, {
      cpuNanos: Number(resources.NanoCPUs || 0) * desired,
      memoryBytes: Number(resources.MemoryBytes || 0) * desired
    }]
  }))
  const nodeNames = new Map(nodes.map((node: any) => [node.ID, node.Description?.Hostname || node.ID]))
  const nodeCapacity = new Map(nodes.map((node: any) => [node.ID, {
    cpuNanos: Number(node.Description?.Resources?.NanoCPUs || 0),
    memoryBytes: Number(node.Description?.Resources?.MemoryBytes || 0)
  }]))

  let serviceRows: any[] = []
  let nodeRows: any[] = []
  let diskRows: any[] = []

  try {
    const db = getDb()
    const [serviceMetrics, nodeMetrics, diskMetrics] = await Promise.all([
      db.query(
        `SELECT bucket,
                service_id,
                array_agg(DISTINCT node_id) AS node_ids,
                sum(cpu_percent) AS cpu_percent,
                sum(memory_used) AS memory_used,
                sum(memory_limit) AS memory_limit
         FROM (
           SELECT time_bucket($1::interval, time) AS bucket,
                  service_id,
                  container_id,
                  max(node_id) AS node_id,
                  avg(cpu_percent) AS cpu_percent,
                  avg(memory_used) AS memory_used,
                  avg(memory_limit) AS memory_limit
           FROM container_metrics
           WHERE service_id IS NOT NULL
             AND lower(COALESCE(state, '')) = 'running'
             AND time > now() - $2::interval
           GROUP BY bucket, service_id, container_id
         ) per_container
         GROUP BY bucket, service_id
         ORDER BY bucket`,
        [bucket, lookback]
      ),
      db.query(
        `SELECT time_bucket($1::interval, time) AS bucket,
                node_id,
                max(hostname) AS hostname,
                avg(cpu_percent) AS cpu_percent,
                avg(cpu_cores) AS cpu_cores,
                avg(memory_used) AS memory_used,
                avg(memory_limit) AS memory_limit,
                avg(memory_percent) AS memory_percent
         FROM node_metrics
         WHERE time > now() - $2::interval
         GROUP BY bucket, node_id
         ORDER BY bucket`,
        [bucket, lookback]
      ),
      db.query(
        `SELECT time_bucket($1::interval, time) AS bucket,
                node_id,
                avg(used_bytes) AS used_bytes,
                avg(total_bytes) AS total_bytes,
                avg(percent) AS percent
         FROM disk_usage
         WHERE time > now() - $2::interval
         GROUP BY bucket, node_id
         ORDER BY bucket`,
        [bucket, lookback]
      )
    ])

    serviceRows = serviceMetrics.rows
    nodeRows = nodeMetrics.rows
    diskRows = diskMetrics.rows
  } catch (err) {
    console.error('[dashboardSnapshot] failed to load metrics', err)
  }

  return {
    sampledAt: new Date().toISOString(),
    range,
    bucket,
    services: serviceRows.map((row: any) => {
      const reservation = serviceReservations.get(row.service_id) || { cpuNanos: 0, memoryBytes: 0 }
      const nodeIds = Array.isArray(row.node_ids) ? row.node_ids.filter(Boolean) : []
      const allocated = nodeIds.reduce((total: { cpuNanos: number; memoryBytes: number }, nodeId: string) => {
        const capacity = nodeCapacity.get(nodeId)
        if (capacity) {
          total.cpuNanos += capacity.cpuNanos
          total.memoryBytes += capacity.memoryBytes
        }
        return total
      }, { cpuNanos: 0, memoryBytes: 0 })
      return {
        time: row.bucket,
        serviceId: row.service_id,
        serviceName: serviceNames.get(row.service_id) || row.service_id,
        cpuPercent: Number(row.cpu_percent || 0),
        memoryUsedBytes: Number(row.memory_used || 0),
        memoryLimitBytes: Number(row.memory_limit || 0),
        reservedCpuNanos: reservation.cpuNanos,
        reservedMemoryBytes: reservation.memoryBytes,
        nodeCpuNanos: allocated.cpuNanos,
        nodeMemoryBytes: allocated.memoryBytes
      }
    }),
    nodes: nodeRows.map((row: any) => ({
      time: row.bucket,
      nodeId: row.node_id,
      hostname: row.hostname || nodeNames.get(row.node_id) || row.node_id,
      cpuPercent: Number(row.cpu_percent || 0),
      cpuCores: Number(row.cpu_cores || 0),
      memoryUsedBytes: Number(row.memory_used || 0),
      memoryLimitBytes: Number(row.memory_limit || 0),
      nodeCpuNanos: nodeCapacity.get(row.node_id)?.cpuNanos || 0,
      nodeMemoryBytes: nodeCapacity.get(row.node_id)?.memoryBytes || Number(row.memory_limit || 0),
      memoryPercent: Number(row.memory_percent || 0)
    })),
    disk: diskRows.map((row: any) => ({
      time: row.bucket,
      nodeId: row.node_id,
      hostname: nodeNames.get(row.node_id) || row.node_id,
      usedBytes: Number(row.used_bytes || 0),
      totalBytes: Number(row.total_bytes || 0),
      percent: Number(row.percent || 0)
    }))
  }
}

// Docker daemon "container" events fire on every exec (healthchecks run one
// every ~10s per container) - never a real lifecycle change, so they're not
// worth an overview recompute. Everything else (create/destroy/start/stop/
// die/health_status/kill/rename/update/...) is.
const NOISY_CONTAINER_ACTIONS = new Set(['exec_create', 'exec_start', 'exec_die', 'exec_detach'])
export function isNoisyDockerEvent(type: string, action: string) {
  return type === 'container' && NOISY_CONTAINER_ACTIONS.has(action)
}
