import { requireUser } from '~~/server/utils/auth'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'
import { useDocker } from '~~/layers/docker/server/utils/docker'

export interface ServiceUsage {
  id: string
  available: boolean
  sampledAt: string | null
  cpuPercent: number
  memoryUsedBytes: number
  memoryLimitBytes: number
  containers: number
  /** Combined CPU/memory capacity of the node(s) currently running this
   * service's tasks - used as the comparison ceiling when the service has
   * no CPU/memory reservation or limit configured of its own. */
  nodeCpuNanos: number
  nodeMemoryBytes: number
}

export interface UsageRow {
  nodeId: string | null
  cpuPercent: number
  memoryUsed: number
  memoryLimit: number
  sampledAt: string
}

// Separate from /api/services (the heavier resource/spec listing) so the UI
// can poll just this lightweight endpoint every few seconds for live ring
// fills, mirroring /api/nodes + /api/nodes/usage's split.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return computeServicesUsage()
})

export async function computeServicesUsage() {
  const [rowsByService, nodeCapacity] = await Promise.all([latestServiceUsageRows(), nodeCapacityById()])

  const services = Array.from(rowsByService.entries()).map(([id, rows]) => {
    let cpuPercent = 0
    let memoryUsedBytes = 0
    let memoryLimitBytes = 0
    let sampledAt: string | null = null
    const nodeIds = new Set<string>()
    for (const row of rows) {
      cpuPercent += row.cpuPercent
      memoryUsedBytes += row.memoryUsed
      memoryLimitBytes += row.memoryLimit
      if (row.nodeId) nodeIds.add(row.nodeId)
      if (!sampledAt || new Date(row.sampledAt).getTime() > new Date(sampledAt).getTime()) sampledAt = row.sampledAt
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
    return { id, available: rows.length > 0, sampledAt, cpuPercent, memoryUsedBytes, memoryLimitBytes, containers: rows.length, nodeCpuNanos, nodeMemoryBytes }
  })

  return { sampledAt: new Date().toISOString(), services }
}

export async function nodeCapacityById(): Promise<Map<string, { cpuNanos: number; memoryBytes: number }>> {
  try {
    const nodes = await useDocker().listNodes()
    return new Map((nodes as any[]).map((n) => [n.ID, {
      cpuNanos: n.Description?.Resources?.NanoCPUs || 0,
      memoryBytes: n.Description?.Resources?.MemoryBytes || 0
    }]))
  } catch {
    return new Map()
  }
}

export async function latestServiceUsageRows(): Promise<Map<string, UsageRow[]>> {
  try {
    const { rows } = await getDb().query(
      `SELECT DISTINCT ON (service_id, COALESCE(task_id, container_id))
              service_id, node_id, cpu_percent, memory_used, memory_limit, time
       FROM container_metrics
       WHERE service_id IS NOT NULL AND lower(COALESCE(state, '')) = 'running' AND time > now() - interval '15 minutes'
       ORDER BY service_id, COALESCE(task_id, container_id), time DESC`
    )
    const byService = new Map<string, UsageRow[]>()
    for (const r of rows as any[]) {
      const list = byService.get(r.service_id) || []
      list.push({
        nodeId: r.node_id ?? null,
        cpuPercent: Number(r.cpu_percent || 0),
        memoryUsed: Number(r.memory_used || 0),
        memoryLimit: Number(r.memory_limit || 0),
        sampledAt: r.time
      })
      byService.set(r.service_id, list)
    }
    return byService
  } catch {
    return new Map()
  }
}
