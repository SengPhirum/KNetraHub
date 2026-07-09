import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  return computeServicesList()
})

export async function computeServicesList() {
  const docker = useDocker()
  const [services, tasks] = await Promise.all([docker.listServices(), docker.listTasks()])
  const running = countTasks(tasks, (t: any) => t.Status?.State === 'running')
  const active = countTasks(tasks, (t: any) => t.DesiredState !== 'shutdown' && t.Status?.State !== 'shutdown')
  return services.map((s) => {
    const replicas = s.Spec?.Mode?.Replicated?.Replicas
    const isGlobal = !!s.Spec?.Mode?.Global
    const desired = isGlobal ? (active.get(s.ID!) || running.get(s.ID!) || 0) : replicas ?? 0
    const runningCount = running.get(s.ID!) || 0
    const updateState = s.UpdateStatus?.State || null
    return {
      id: s.ID,
      name: s.Spec?.Name,
      stack: s.Spec?.Labels?.[STACK_LABEL] || null,
      image: (s.Spec?.TaskTemplate?.ContainerSpec?.Image || '').split('@')[0],
      mode: isGlobal ? 'global' : 'replicated',
      replicas: isGlobal ? null : replicas ?? 0,
      desired,
      running: runningCount,
      status: serviceStatus(runningCount, desired, updateState),
      ports: (s.Endpoint?.Ports || []).map((p) => ({
        published: p.PublishedPort,
        target: p.TargetPort,
        protocol: p.Protocol,
        mode: p.PublishMode
      })),
      createdAt: s.CreatedAt,
      updatedAt: s.UpdatedAt,
      updateState,
      resources: serviceResources(s, desired)
    }
  })
}

function countTasks(tasks: any[], predicate: (task: any) => boolean) {
  const out = new Map<string, number>()
  for (const task of tasks as any[]) {
    if (!task.ServiceID || !predicate(task)) continue
    out.set(task.ServiceID, (out.get(task.ServiceID) || 0) + 1)
  }
  return out
}

function serviceStatus(running: number, desired: number, updateState?: string | null) {
  if (updateState && updateState !== 'completed') return 'updating'
  if (desired === 0) return 'idle'
  if (running >= desired) return 'running'
  if (running > 0) return 'pending'
  return 'down'
}

function serviceResources(service: any, desired: number) {
  const resources = service.Spec?.TaskTemplate?.Resources || {}
  const reservations = resources.Reservations || {}
  const limits = resources.Limits || {}
  return {
    reservedNanoCpus: reservations.NanoCPUs || 0,
    reservedMemoryBytes: reservations.MemoryBytes || 0,
    limitNanoCpus: limits.NanoCPUs || 0,
    limitMemoryBytes: limits.MemoryBytes || 0,
    reservedNanoCpusTotal: (reservations.NanoCPUs || 0) * desired,
    reservedMemoryBytesTotal: (reservations.MemoryBytes || 0) * desired,
    limitNanoCpusTotal: (limits.NanoCPUs || 0) * desired,
    limitMemoryBytesTotal: (limits.MemoryBytes || 0) * desired
  }
}
