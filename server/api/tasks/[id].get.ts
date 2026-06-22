import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()

  const task = await docker.getTask(id).inspect().catch(() => null)
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  const [services, nodes, metric] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listNodes().catch(() => []),
    latestTaskMetric(id)
  ])

  const service = (services as any[]).find((s) => s.ID === task.ServiceID)
  const node = (nodes as any[]).find((n) => n.ID === task.NodeID)

  const [image, imageDigest] = (task.Spec?.ContainerSpec?.Image || '').split('@')
  const resources = task.Spec?.Resources || {}
  const reservations = resources.Reservations || {}
  const limits = resources.Limits || {}
  const isRunning = task.Status?.State === 'running'

  return {
    id: task.ID,
    slot: task.Slot,
    state: task.Status?.State || null,
    desiredState: task.DesiredState,
    message: task.Status?.Err || task.Status?.Message || null,
    createdAt: task.CreatedAt,
    updatedAt: task.UpdatedAt || task.Status?.Timestamp,
    containerId: task.Status?.ContainerStatus?.ContainerID || null,
    image: image || null,
    imageDigest: imageDigest || null,
    serviceId: task.ServiceID,
    serviceName: service?.Spec?.Name || task.ServiceID,
    nodeId: task.NodeID,
    nodeName: node?.Description?.Hostname || task.NodeID,
    resources: {
      reservedNanoCpus: reservations.NanoCPUs || 0,
      reservedMemoryBytes: reservations.MemoryBytes || 0,
      limitNanoCpus: limits.NanoCPUs || 0,
      limitMemoryBytes: limits.MemoryBytes || 0
    },
    currentUsage: isRunning ? metric : emptyTaskMetric()
  }
})

function emptyTaskMetric() {
  return { available: false, sampledAt: null, cpuPercent: 0, memoryUsedBytes: 0, memoryLimitBytes: 0 }
}

async function latestTaskMetric(taskId: string) {
  try {
    const { rows } = await getDb().query(
      `SELECT time, cpu_percent, memory_used, memory_limit
       FROM container_metrics
       WHERE task_id = $1 AND lower(COALESCE(state, '')) = 'running'
       ORDER BY time DESC
       LIMIT 1`,
      [taskId]
    )
    const row = rows[0]
    if (!row) return emptyTaskMetric()
    return {
      available: true,
      sampledAt: row.time,
      cpuPercent: Number(row.cpu_percent || 0),
      memoryUsedBytes: Number(row.memory_used || 0),
      memoryLimitBytes: Number(row.memory_limit || 0)
    }
  } catch {
    return emptyTaskMetric()
  }
}
