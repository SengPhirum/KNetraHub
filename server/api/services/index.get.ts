import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
import { STACK_LABEL } from '~~/server/utils/stack'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  const docker = useDocker()
  const [services, tasks] = await Promise.all([docker.listServices(), docker.listTasks()])
  const running = new Map<string, number>()
  for (const t of tasks) {
    if (t.Status?.State === 'running' && t.ServiceID) {
      running.set(t.ServiceID, (running.get(t.ServiceID) || 0) + 1)
    }
  }
  return services.map((s) => {
    const replicas = s.Spec?.Mode?.Replicated?.Replicas
    const isGlobal = !!s.Spec?.Mode?.Global
    return {
      id: s.ID,
      name: s.Spec?.Name,
      stack: s.Spec?.Labels?.[STACK_LABEL] || null,
      image: (s.Spec?.TaskTemplate?.ContainerSpec?.Image || '').split('@')[0],
      mode: isGlobal ? 'global' : 'replicated',
      replicas: isGlobal ? null : replicas ?? 0,
      running: running.get(s.ID!) || 0,
      ports: (s.Endpoint?.Ports || []).map((p) => ({ published: p.PublishedPort, target: p.TargetPort, protocol: p.Protocol })),
      updatedAt: s.UpdatedAt,
      updateState: s.UpdateStatus?.State || null
    }
  })
})
