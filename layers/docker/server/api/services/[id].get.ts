import { requireUser } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { AUTOREDEPLOY_LABEL } from '~~/layers/docker/server/utils/registryClient'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()

  const [service, tasks, nodes, networks, volumeList] = await Promise.all([
    docker.getService(id).inspect(),
    docker.listTasks({ filters: JSON.stringify({ service: [id] }) }),
    docker.listNodes().catch(() => []),
    docker.listNetworks().catch(() => []),
    docker.listVolumes().catch(() => ({ Volumes: [] }))
  ])

  const nodeById = new Map((nodes as any[]).map((n) => [n.ID, n.Description?.Hostname || n.ID]))
  const nodeCapacityById = new Map((nodes as any[]).map((n) => [n.ID, {
    cpuNanos: n.Description?.Resources?.NanoCPUs || 0,
    memoryBytes: n.Description?.Resources?.MemoryBytes || 0
  }]))
  const networkById = new Map((networks as any[]).map((n) => [n.Id, n]))
  const volumeByName = new Map(((volumeList as any)?.Volumes || []).map((v: any) => [v.Name, v]))
  const runningTaskIds = new Set(
    (tasks as any[])
      .filter((task) => task.Status?.State === 'running')
      .map((task) => task.ID)
      .filter(Boolean)
  )
  const metrics = await latestServiceMetrics(id, [...runningTaskIds], nodeCapacityById)

  const spec = service.Spec || {}
  const taskTemplate = spec.TaskTemplate || {}
  const container = taskTemplate.ContainerSpec || {}
  const stack = spec.Labels?.[STACK_LABEL] || null
  const isGlobal = !!spec.Mode?.Global
  const running = (tasks as any[]).filter((t) => t.Status?.State === 'running').length
  const active = (tasks as any[]).filter((t) => t.DesiredState !== 'shutdown' && t.Status?.State !== 'shutdown').length
  const replicas = spec.Mode?.Replicated?.Replicas ?? null
  const desired = isGlobal ? (active || running) : replicas ?? 0
  const updateState = service.UpdateStatus?.State || null
  const resources = serviceResources(service, desired)
  const image = stripDigest(container.Image)
  const imageInfo = imageParts(image)

  const taskRows = (tasks as any[])
    .map((task) => {
      const state = task.Status?.State || null
      const taskMetrics = state === 'running' ? metrics.byTask.get(task.ID) : null
      return {
        id: task.ID,
        slot: task.Slot,
        nodeId: task.NodeID,
        nodeName: nodeById.get(task.NodeID) || task.NodeID,
        image: stripDigest(task.Spec?.ContainerSpec?.Image),
        desiredState: task.DesiredState,
        state,
        status: task.Status || {},
        message: task.Status?.Err || task.Status?.Message || null,
        timestamp: task.Status?.Timestamp || task.UpdatedAt || task.CreatedAt,
        containerId: task.Status?.ContainerStatus?.ContainerID || null,
        metrics: taskMetrics || null
      }
    })
    .sort((a, b) => {
      const slotOrder = Number(a.slot || 0) - Number(b.slot || 0)
      return slotOrder || (b.timestamp || '').localeCompare(a.timestamp || '')
    })

  const serviceNetworks = (taskTemplate.Networks || [])
    .map((n: any) => networkById.get(n.Target))
    .filter(Boolean)
    .map((network: any) => ({
      id: network.Id,
      name: network.Name,
      driver: network.Driver || null,
      scope: network.Scope || null,
      attachable: !!network.Attachable,
      internal: !!network.Internal,
      subnets: (network.IPAM?.Config || []).map((c: any) => c.Subnet).filter(Boolean),
      gateways: (network.IPAM?.Config || []).map((c: any) => c.Gateway).filter(Boolean)
    }))

  const mounts = (container.Mounts || []).map((mount: any) => {
    const volume = mount.Source ? volumeByName.get(mount.Source) : null
    return {
      type: mount.Type || null,
      source: mount.Source || null,
      target: mount.Target || null,
      readOnly: !!mount.ReadOnly,
      driver: (volume as any)?.Driver || null
    }
  })

  return {
    service,
    tasks,
    summary: {
      id: service.ID,
      name: spec.Name,
      stack,
      image,
      registry: imageInfo.registry,
      repository: imageInfo.repository,
      tag: imageInfo.tag,
      imageRepository: imageInfo.registry === 'Docker Hub' ? imageInfo.repository : `${imageInfo.registry}/${imageInfo.repository}`,
      command: (container.Args || []).join(' '),
      mode: isGlobal ? 'global' : 'replicated',
      replicas: isGlobal ? null : replicas ?? 0,
      desired,
      running,
      status: serviceStatus(running, desired, updateState),
      updateState,
      createdAt: service.CreatedAt,
      updatedAt: service.UpdatedAt,
      endpointMode: service.Endpoint?.Spec?.Mode || spec.EndpointSpec?.Mode || null,
      resources,
      currentUsage: metrics.current
    },
    tasksDetailed: taskRows,
    networks: serviceNetworks,
    ports: servicePorts(service),
    mounts,
    environment: parseEnv(container.Env || []),
    extraHosts: container.Hosts || [],
    labels: {
      service: withoutStackLabel(spec.Labels || {}),
      container: withoutStackLabel(container.Labels || {})
    },
    configs: (container.Configs || []).map((config: any) => ({
      id: config.ConfigID,
      name: config.ConfigName,
      fileName: config.File?.Name || null,
      uid: config.File?.UID || null,
      gid: config.File?.GID || null,
      mode: config.File?.Mode || null
    })),
    secrets: (container.Secrets || []).map((secret: any) => ({
      id: secret.SecretID,
      name: secret.SecretName,
      fileName: secret.File?.Name || null,
      uid: secret.File?.UID || null,
      gid: secret.File?.GID || null,
      mode: secret.File?.Mode || null
    })),
    placement: taskTemplate.Placement || {},
    restartPolicy: taskTemplate.RestartPolicy || null,
    updateConfig: spec.UpdateConfig || null,
    rollbackConfig: spec.RollbackConfig || null,
    logDriver: taskTemplate.LogDriver ? { name: taskTemplate.LogDriver.Name, options: taskTemplate.LogDriver.Options || {} } : null,
    autoredeploy: spec.Labels?.[AUTOREDEPLOY_LABEL] === 'true'
  }
})

async function latestServiceMetrics(serviceId: string, runningTaskIds: string[], nodeCapacityById: Map<string, { cpuNanos: number; memoryBytes: number }>) {
  if (!runningTaskIds.length) return emptyServiceMetrics()

  try {
    const { rows } = await getDb().query(
      `SELECT DISTINCT ON (COALESCE(task_id, container_id))
              time,
              node_id,
              container_id,
              container_name,
              task_id,
              cpu_percent,
              memory_used,
              memory_limit,
              state
       FROM container_metrics
       WHERE service_id = $1 AND task_id = ANY($2::text[]) AND lower(COALESCE(state, '')) = 'running' AND time > now() - interval '15 minutes'
       ORDER BY COALESCE(task_id, container_id), time DESC`,
      [serviceId, runningTaskIds]
    )
    const byTask = new Map<string, any>()
    let cpuPercent = 0
    let memoryUsedBytes = 0
    let memoryLimitBytes = 0
    let sampledAt: string | null = null
    const nodeIds = new Set<string>()
    for (const row of rows) {
      const metric = {
        sampledAt: row.time,
        nodeId: row.node_id,
        containerId: row.container_id,
        containerName: row.container_name,
        taskId: row.task_id,
        cpuPercent: Number(row.cpu_percent || 0),
        memoryUsedBytes: Number(row.memory_used || 0),
        memoryLimitBytes: Number(row.memory_limit || 0),
        state: row.state
      }
      cpuPercent += metric.cpuPercent
      memoryUsedBytes += metric.memoryUsedBytes
      memoryLimitBytes += metric.memoryLimitBytes
      if (metric.nodeId) nodeIds.add(metric.nodeId)
      if (!sampledAt || new Date(metric.sampledAt).getTime() > new Date(sampledAt).getTime()) sampledAt = metric.sampledAt
      if (metric.taskId) byTask.set(metric.taskId, metric)
    }
    // Combined capacity of the node(s) actually running this service right
    // now - the comparison ceiling for services with no CPU/memory
    // reservation or limit of their own configured.
    let nodeCpuNanos = 0
    let nodeMemoryBytes = 0
    for (const nodeId of nodeIds) {
      const cap = nodeCapacityById.get(nodeId)
      if (cap) {
        nodeCpuNanos += cap.cpuNanos
        nodeMemoryBytes += cap.memoryBytes
      }
    }
    return {
      byTask,
      current: {
        available: rows.length > 0,
        sampledAt,
        containers: rows.length,
        cpuPercent,
        memoryUsedBytes,
        memoryLimitBytes,
        nodeCpuNanos,
        nodeMemoryBytes
      }
    }
  } catch {
    return emptyServiceMetrics()
  }
}

function emptyServiceMetrics() {
  return {
    byTask: new Map<string, any>(),
    current: {
      available: false,
      sampledAt: null,
      containers: 0,
      cpuPercent: 0,
      memoryUsedBytes: 0,
      memoryLimitBytes: 0,
      nodeCpuNanos: 0,
      nodeMemoryBytes: 0
    }
  }
}

function stripDigest(image?: string | null) {
  return (image || '').split('@')[0]
}

function imageParts(image: string) {
  const slashIndex = image.lastIndexOf('/')
  const colonIndex = image.lastIndexOf(':')
  const hasTag = colonIndex > slashIndex
  const repositoryPart = hasTag ? image.slice(0, colonIndex) : image
  const tagPart = hasTag ? image.slice(colonIndex + 1) : ''
  const first = repositoryPart.split('/')[0]
  const hasRegistry = first.includes('.') || first.includes(':') || first === 'localhost'
  const registry = hasRegistry ? first : 'Docker Hub'
  const repository = hasRegistry ? repositoryPart.split('/').slice(1).join('/') : repositoryPart
  return {
    registry,
    repository,
    tag: tagPart || 'latest'
  }
}

function servicePorts(service: any) {
  return (service.Endpoint?.Ports || service.Endpoint?.Spec?.Ports || []).map((p: any) => ({
    published: p.PublishedPort ?? null,
    target: p.TargetPort ?? null,
    protocol: p.Protocol || 'tcp',
    mode: p.PublishMode || null
  }))
}

function parseEnv(env: string[]) {
  return env.map((entry) => {
    const [key, ...rest] = String(entry).split('=')
    return { key, value: rest.join('=') }
  })
}

function withoutStackLabel(labels: Record<string, string>) {
  return Object.fromEntries(Object.entries(labels || {}).filter(([key]) => key !== STACK_LABEL))
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
