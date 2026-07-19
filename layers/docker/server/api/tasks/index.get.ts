import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  return computeTasksList()
})

export async function computeTasksList() {
  const docker = useDocker()
  const [tasks, services, nodes] = await Promise.all([docker.listTasks(), docker.listServices(), docker.listNodes()])
  const svc = new Map(services.map((s) => [s.ID, s.Spec?.Name]))
  const node = new Map(nodes.map((n) => [n.ID, n.Description?.Hostname]))
  const metricsByTask = await latestTaskMetrics()
  return tasks.map((t) => ({
    id: t.ID,
    service: svc.get(t.ServiceID!) || t.ServiceID,
    serviceId: t.ServiceID,
    node: node.get(t.NodeID!) || t.NodeID,
    nodeId: t.NodeID,
    slot: t.Slot,
    image: (t.Spec?.ContainerSpec?.Image || '').split('@')[0],
    desiredState: t.DesiredState,
    state: t.Status?.State,
    message: t.Status?.Err || t.Status?.Message,
    timestamp: t.Status?.Timestamp,
    createdAt: t.CreatedAt,
    metrics: metricsByTask.get(t.ID!) || null
  })).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
}

/** Latest per-task sample across the whole cluster (not scoped to one
 * service), so the tasks list can show live CPU/memory next to every row. */
async function latestTaskMetrics(): Promise<Map<string, any>> {
  try {
    const { rows } = await getDb().query(
      `SELECT DISTINCT ON (task_id) task_id, cpu_percent, memory_used, memory_limit, time
       FROM container_metrics
       WHERE task_id IS NOT NULL AND time > now() - interval '15 minutes'
       ORDER BY task_id, time DESC`
    )
    return new Map(rows.map((r: any) => [r.task_id, {
      cpuPercent: Number(r.cpu_percent || 0),
      memoryUsedBytes: Number(r.memory_used || 0),
      memoryLimitBytes: Number(r.memory_limit || 0),
      sampledAt: r.time
    }]))
  } catch {
    return new Map()
  }
}
