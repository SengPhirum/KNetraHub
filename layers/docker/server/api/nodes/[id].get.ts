import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const [node, tasks, services, metricsByTask] = await Promise.all([
    docker.getNode(id).inspect(),
    docker.listTasks({ filters: JSON.stringify({ node: [id] }) }),
    docker.listServices().catch(() => []),
    latestTaskMetrics(id)
  ])
  const svc = new Map((services as any[]).map((s) => [s.ID, s.Spec?.Name]))
  const tasksDetailed = (tasks as any[]).map((t) => ({
    id: t.ID,
    service: svc.get(t.ServiceID!) || t.ServiceID,
    slot: t.Slot,
    image: (t.Spec?.ContainerSpec?.Image || '').split('@')[0],
    state: t.Status?.State,
    message: t.Status?.Err || t.Status?.Message,
    timestamp: t.Status?.Timestamp,
    metrics: metricsByTask.get(t.ID!) || null
  }))
  return { node, tasks, tasksDetailed }
})

/** Latest per-task sample for tasks running on this node, so the node's
 * task table can show live CPU/memory next to each row. */
async function latestTaskMetrics(nodeId: string): Promise<Map<string, any>> {
  try {
    const { rows } = await getDb().query(
      `SELECT DISTINCT ON (task_id) task_id, cpu_percent, memory_used, memory_limit, time
       FROM container_metrics
       WHERE node_id = $1 AND task_id IS NOT NULL AND time > now() - interval '15 minutes'
       ORDER BY task_id, time DESC`,
      [nodeId]
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
