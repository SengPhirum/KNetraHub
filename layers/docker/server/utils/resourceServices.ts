import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'

export function servicePorts(service: any) {
  return (service.Endpoint?.Ports || service.Endpoint?.Spec?.Ports || []).map((p: any) => ({
    published: p.PublishedPort ?? null,
    target: p.TargetPort ?? null,
    protocol: p.Protocol || 'tcp',
    mode: p.PublishMode || null
  }))
}

export function stripDigest(image?: string | null) {
  return (image || '').split('@')[0]
}

export function serviceStatus(running: number, desired: number, updateState?: string | null) {
  if (updateState && updateState !== 'completed') return 'updating'
  if (desired === 0) return 'idle'
  if (running >= desired) return 'running'
  if (running > 0) return 'pending'
  return 'down'
}

export function summarizeServices(services: any[], tasks: any[]) {
  const running = countBy(
    tasks.filter((t: any) => t.Status?.State === 'running' && t.ServiceID),
    (t: any) => t.ServiceID
  )
  const active = countBy(
    tasks.filter((t: any) => t.DesiredState !== 'shutdown' && t.Status?.State !== 'shutdown' && t.ServiceID),
    (t: any) => t.ServiceID
  )

  return services.map((service: any) => {
    const replicas = service.Spec?.Mode?.Replicated?.Replicas
    const isGlobal = !!service.Spec?.Mode?.Global
    const desired = isGlobal ? (active.get(service.ID) || running.get(service.ID) || 0) : replicas ?? 0
    const runningCount = running.get(service.ID) || 0
    const updateState = service.UpdateStatus?.State || null
    return {
      id: service.ID,
      name: service.Spec?.Name || service.ID,
      stack: service.Spec?.Labels?.[STACK_LABEL] || null,
      image: stripDigest(service.Spec?.TaskTemplate?.ContainerSpec?.Image),
      mode: isGlobal ? 'global' : 'replicated',
      replicas: isGlobal ? null : replicas ?? 0,
      desired,
      running: runningCount,
      status: serviceStatus(runningCount, desired, updateState),
      ports: servicePorts(service),
      createdAt: service.CreatedAt,
      updatedAt: service.UpdatedAt,
      updateState
    }
  })
}

function countBy(items: any[], key: (item: any) => string | undefined) {
  const out = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) out.set(k, (out.get(k) || 0) + 1)
  }
  return out
}
