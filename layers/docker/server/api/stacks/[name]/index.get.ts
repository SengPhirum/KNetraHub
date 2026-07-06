import { stringify as stringifyYaml } from 'yaml'
import { requireUser } from '~~/server/utils/auth'
import { stackServices, STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { gitlabEnabled, getStackFile, stackHistory } from '~~/layers/docker/server/utils/gitlab'
import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = getRouterParam(event, 'name')!
  const docker = useDocker()

  const services = await stackServices(name)
  const serviceIds = new Set(services.map((s: any) => s.ID).filter(Boolean))
  const [
    allTasks,
    allNetworks,
    volumeList,
    allConfigs,
    allSecrets
  ] = await Promise.all([
    docker.listTasks().catch(() => []),
    docker.listNetworks().catch(() => []),
    docker.listVolumes().catch(() => ({ Volumes: [] })),
    docker.listConfigs().catch(() => []),
    docker.listSecrets().catch(() => [])
  ])

  const stackTasks = (allTasks as any[]).filter((t) =>
    serviceIds.has(t.ServiceID) ||
    t.Spec?.ContainerSpec?.Labels?.[STACK_LABEL] === name ||
    t.Labels?.[STACK_LABEL] === name
  )
  const running = countBy(
    stackTasks.filter((t) => t.Status?.State === 'running' && t.ServiceID),
    (t) => t.ServiceID
  )
  const activeTasks = stackTasks.filter((t) => t.DesiredState !== 'shutdown' && t.Status?.State !== 'shutdown')
  const desiredGlobal = countBy(activeTasks.filter((t) => t.ServiceID), (t) => t.ServiceID)

  const serviceNetworkIds = new Set<string>()
  const volumeSources = new Set<string>()
  const volumeUsers = new Map<string, Set<string>>()
  const configIds = new Set<string>()
  const secretIds = new Set<string>()
  const configNames = new Set<string>()
  const secretNames = new Set<string>()

  for (const service of services as any[]) {
    const serviceName = displayName(name, service.Spec?.Name)
    for (const n of service.Spec?.TaskTemplate?.Networks || []) {
      if (n.Target) serviceNetworkIds.add(n.Target)
    }
    for (const mount of service.Spec?.TaskTemplate?.ContainerSpec?.Mounts || []) {
      if (mount.Type !== 'volume' || !mount.Source) continue
      volumeSources.add(mount.Source)
      const users = volumeUsers.get(mount.Source) || new Set<string>()
      users.add(serviceName)
      volumeUsers.set(mount.Source, users)
    }
    for (const c of service.Spec?.TaskTemplate?.ContainerSpec?.Configs || []) {
      if (c.ConfigID) configIds.add(c.ConfigID)
      if (c.ConfigName) configNames.add(c.ConfigName)
    }
    for (const s of service.Spec?.TaskTemplate?.ContainerSpec?.Secrets || []) {
      if (s.SecretID) secretIds.add(s.SecretID)
      if (s.SecretName) secretNames.add(s.SecretName)
    }
  }

  const networks = (allNetworks as any[]).filter((n) =>
    n.Labels?.[STACK_LABEL] === name || serviceNetworkIds.has(n.Id)
  )
  const volumes = ((volumeList as any)?.Volumes || []).filter((v: any) =>
    v.Labels?.[STACK_LABEL] === name || volumeSources.has(v.Name)
  )
  const configs = (allConfigs as any[]).filter((c) =>
    c.Spec?.Labels?.[STACK_LABEL] === name || configIds.has(c.ID) || configNames.has(c.Spec?.Name)
  )
  const secrets = (allSecrets as any[]).filter((s) =>
    s.Spec?.Labels?.[STACK_LABEL] === name || secretIds.has(s.ID) || secretNames.has(s.Spec?.Name)
  )

  const networkById = new Map(networks.map((n: any) => [n.Id, n]))
  const volumeByName = new Map(volumes.map((v: any) => [v.Name, v]))
  const configById = new Map(configs.map((c: any) => [c.ID, c]))
  const secretById = new Map(secrets.map((s: any) => [s.ID, s]))

  let compose: string | null = null
  let composeSource: 'gitlab' | 'engine' | null = null
  let history: any[] = []
  if (await gitlabEnabled()) {
    compose = await getStackFile(name).catch(() => null)
    history = await stackHistory(name).catch(() => [])
    if (compose) composeSource = 'gitlab'
  }
  if (!compose && services.length) {
    compose = composeFromEngineState(name, services, networkById, volumeByName, configById, secretById)
    composeSource = 'engine'
  }

  const serviceRows = services.map((s: any) => {
    const replicas = s.Spec?.Mode?.Replicated?.Replicas
    const isGlobal = !!s.Spec?.Mode?.Global
    const desired = isGlobal ? (desiredGlobal.get(s.ID) || running.get(s.ID) || 0) : replicas ?? 0
    const runningCount = running.get(s.ID) || 0
    const resources = serviceResources(s, desired)
    const updateState = s.UpdateStatus?.State || null
    return {
      id: s.ID,
      name: displayName(name, s.Spec?.Name),
      fullName: s.Spec?.Name,
      image: stripDigest(s.Spec?.TaskTemplate?.ContainerSpec?.Image),
      mode: isGlobal ? 'global' : 'replicated',
      replicas: isGlobal ? null : desired,
      desired,
      running: runningCount,
      status: serviceStatus(runningCount, desired, updateState),
      updateState,
      ports: servicePorts(s),
      networks: (s.Spec?.TaskTemplate?.Networks || [])
        .map((n: any) => networkById.get(n.Target))
        .filter(Boolean)
        .map((n: any) => displayName(name, n.Name)),
      mounts: (s.Spec?.TaskTemplate?.ContainerSpec?.Mounts || []).map((m: any) => ({
        type: m.Type,
        source: m.Source || null,
        target: m.Target || null,
        readOnly: !!m.ReadOnly
      })),
      configs: (s.Spec?.TaskTemplate?.ContainerSpec?.Configs || []).map((c: any) => displayName(name, c.ConfigName)),
      secrets: (s.Spec?.TaskTemplate?.ContainerSpec?.Secrets || []).map((sec: any) => displayName(name, sec.SecretName)),
      resources,
      createdAt: s.CreatedAt,
      updatedAt: s.UpdatedAt
    }
  })

  const runningTasks = serviceRows.reduce((sum, s) => sum + (s.running || 0), 0)
  const desiredTasks = serviceRows.reduce((sum, s) => sum + (s.desired || 0), 0)
  const reservedNanoCpus = serviceRows.reduce((sum, s) => sum + (s.resources.reservedNanoCpusTotal || 0), 0)
  const reservedMemoryBytes = serviceRows.reduce((sum, s) => sum + (s.resources.reservedMemoryBytesTotal || 0), 0)
  const limitNanoCpus = serviceRows.reduce((sum, s) => sum + (s.resources.limitNanoCpusTotal || 0), 0)
  const limitMemoryBytes = serviceRows.reduce((sum, s) => sum + (s.resources.limitMemoryBytesTotal || 0), 0)
  const runningTaskIds = stackTasks
    .filter((task) => task.Status?.State === 'running')
    .map((task) => task.ID)
    .filter(Boolean)
  const currentUsage = await latestStackMetrics(runningTaskIds)

  return {
    name,
    compose,
    composeSource,
    history,
    summary: {
      status: stackStatus(services.length, runningTasks, desiredTasks, compose),
      services: services.length,
      networks: networks.length,
      volumes: volumes.length,
      configs: configs.length,
      secrets: secrets.length,
      runningTasks,
      desiredTasks,
      reservedNanoCpus,
      reservedMemoryBytes,
      limitNanoCpus,
      limitMemoryBytes,
      currentUsage,
      createdAt: earliest(services.map((s: any) => s.CreatedAt)),
      updatedAt: latest(services.map((s: any) => s.UpdatedAt))
    },
    services: serviceRows,
    networks: networks.map((n: any) => ({
      id: n.Id,
      name: displayName(name, n.Name),
      fullName: n.Name,
      driver: n.Driver || null,
      scope: n.Scope || null,
      attachable: !!n.Attachable,
      internal: !!n.Internal,
      ingress: !!n.Ingress,
      subnets: (n.IPAM?.Config || []).map((c: any) => c.Subnet).filter(Boolean),
      gateways: (n.IPAM?.Config || []).map((c: any) => c.Gateway).filter(Boolean),
      createdAt: n.Created || null
    })),
    volumes: volumes.map((v: any) => ({
      name: displayName(name, v.Name),
      fullName: v.Name,
      driver: v.Driver || null,
      scope: v.Scope || null,
      mountpoint: v.Mountpoint || null,
      labels: v.Labels || {},
      usedBy: [...(volumeUsers.get(v.Name) || new Set<string>())]
    })),
    configs: configs.map((c: any) => ({
      id: c.ID,
      name: displayName(name, c.Spec?.Name),
      fullName: c.Spec?.Name,
      createdAt: c.CreatedAt,
      updatedAt: c.UpdatedAt
    })),
    secrets: secrets.map((s: any) => ({
      id: s.ID,
      name: displayName(name, s.Spec?.Name),
      fullName: s.Spec?.Name,
      createdAt: s.CreatedAt,
      updatedAt: s.UpdatedAt
    }))
  }
})

function countBy(items: any[], key: (item: any) => string | undefined) {
  const out = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) out.set(k, (out.get(k) || 0) + 1)
  }
  return out
}

function displayName(stackName: string, value?: string | null) {
  if (!value) return ''
  const prefix = `${stackName}_`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function stripDigest(image?: string | null) {
  return (image || '').split('@')[0]
}

function servicePorts(service: any) {
  return (service.Endpoint?.Ports || service.Endpoint?.Spec?.Ports || []).map((p: any) => ({
    published: p.PublishedPort ?? null,
    target: p.TargetPort ?? null,
    protocol: p.Protocol || 'tcp',
    mode: p.PublishMode || null
  }))
}

function serviceStatus(running: number, desired: number, updateState?: string | null) {
  if (updateState && updateState !== 'completed') return 'updating'
  if (desired === 0) return 'idle'
  if (running >= desired) return 'running'
  if (running > 0) return 'pending'
  return 'down'
}

function stackStatus(serviceCount: number, runningTasks: number, desiredTasks: number, compose: string | null) {
  if (!serviceCount) return compose ? 'defined' : 'empty'
  if (desiredTasks === 0) return 'idle'
  if (runningTasks >= desiredTasks) return 'deployed'
  if (runningTasks > 0) return 'partial'
  return 'down'
}

function serviceResources(service: any, desired: number) {
  const r = service.Spec?.TaskTemplate?.Resources || {}
  const reservations = r.Reservations || {}
  const limits = r.Limits || {}
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

async function latestStackMetrics(runningTaskIds: string[]) {
  if (!runningTaskIds.length) {
    return {
      available: false,
      sampledAt: null,
      containers: 0,
      cpuPercent: 0,
      memoryUsedBytes: 0,
      memoryLimitBytes: 0
    }
  }

  try {
    const { rows } = await getDb().query(
      `SELECT sum(cpu_percent) AS cpu_percent,
              sum(memory_used) AS memory_used,
              sum(memory_limit) AS memory_limit,
              max(time) AS sampled_at,
              count(*) AS containers
       FROM (
         SELECT DISTINCT ON (service_id, COALESCE(task_id, container_id))
                service_id, task_id, container_id, cpu_percent, memory_used, memory_limit, time
         FROM container_metrics
         WHERE task_id = ANY($1::text[]) AND lower(COALESCE(state, '')) = 'running' AND time > now() - interval '15 minutes'
         ORDER BY service_id, COALESCE(task_id, container_id), time DESC
       ) latest`,
      [runningTaskIds]
    )
    const row = rows[0]
    const containers = Number(row?.containers || 0)
    return {
      available: containers > 0,
      sampledAt: row?.sampled_at || null,
      containers,
      cpuPercent: Number(row?.cpu_percent || 0),
      memoryUsedBytes: Number(row?.memory_used || 0),
      memoryLimitBytes: Number(row?.memory_limit || 0)
    }
  } catch {
    return {
      available: false,
      sampledAt: null,
      containers: 0,
      cpuPercent: 0,
      memoryUsedBytes: 0,
      memoryLimitBytes: 0
    }
  }
}

function earliest(values: Array<string | undefined>) {
  const dates = values.filter(Boolean).map((v) => new Date(v!).getTime()).filter(Number.isFinite)
  if (!dates.length) return null
  return new Date(Math.min(...dates)).toISOString()
}

function latest(values: Array<string | undefined>) {
  const dates = values.filter(Boolean).map((v) => new Date(v!).getTime()).filter(Number.isFinite)
  if (!dates.length) return null
  return new Date(Math.max(...dates)).toISOString()
}

function composeFromEngineState(
  stackName: string,
  services: any[],
  networkById: Map<string, any>,
  volumeByName: Map<string, any>,
  configById: Map<string, any>,
  secretById: Map<string, any>
) {
  const doc: any = { version: '3.8', services: {} }
  const networks = new Map<string, any>()
  const volumes = new Map<string, any>()
  const configs = new Map<string, any>()
  const secrets = new Map<string, any>()

  for (const service of services as any[]) {
    const spec = service.Spec || {}
    const container = spec.TaskTemplate?.ContainerSpec || {}
    const serviceName = displayName(stackName, spec.Name)
    const svc: any = {}
    if (container.Image) svc.image = stripDigest(container.Image)
    if (container.Command?.length) svc.command = container.Command
    if (container.Args?.length) svc.args = container.Args
    if (container.Env?.length) svc.environment = envObject(container.Env)
    if (container.Dir) svc.working_dir = container.Dir
    if (container.User) svc.user = container.User
    if (container.Hostname) svc.hostname = container.Hostname

    const ports = servicePorts(service).map(composePort).filter(Boolean)
    if (ports.length) svc.ports = ports

    const serviceNetworks = (spec.TaskTemplate?.Networks || [])
      .map((n: any) => networkById.get(n.Target))
      .filter(Boolean)
      .map((network: any) => {
        const key = displayName(stackName, network.Name)
        networks.set(key, network)
        return key
      })
    if (serviceNetworks.length) svc.networks = serviceNetworks

    const mounts = (container.Mounts || []).map((mount: any) => {
      const entry = composeMount(stackName, mount)
      if (mount.Type === 'volume' && mount.Source) {
        const key = displayName(stackName, mount.Source)
        volumes.set(key, volumeByName.get(mount.Source) || { Name: mount.Source })
      }
      return entry
    }).filter(Boolean)
    if (mounts.length) svc.volumes = mounts

    const serviceConfigs = (container.Configs || []).map((config: any) => {
      const item = configById.get(config.ConfigID)
      const key = displayName(stackName, config.ConfigName || item?.Spec?.Name)
      configs.set(key, item || { Spec: { Name: config.ConfigName } })
      return key
    }).filter(Boolean)
    if (serviceConfigs.length) svc.configs = serviceConfigs

    const serviceSecrets = (container.Secrets || []).map((secret: any) => {
      const item = secretById.get(secret.SecretID)
      const key = displayName(stackName, secret.SecretName || item?.Spec?.Name)
      secrets.set(key, item || { Spec: { Name: secret.SecretName } })
      return key
    }).filter(Boolean)
    if (serviceSecrets.length) svc.secrets = serviceSecrets

    const deploy = composeDeploy(service)
    if (Object.keys(deploy).length) svc.deploy = deploy

    doc.services[serviceName] = svc
  }

  if (networks.size) {
    doc.networks = Object.fromEntries([...networks].map(([key, network]) => [key, composeNetwork(stackName, key, network)]))
  }
  if (volumes.size) {
    doc.volumes = Object.fromEntries([...volumes].map(([key, volume]) => [key, composeVolume(stackName, key, volume)]))
  }
  if (configs.size) {
    doc.configs = Object.fromEntries([...configs].map(([key, config]) => [key, composeExternalResource(stackName, key, config.Spec?.Name)]))
  }
  if (secrets.size) {
    doc.secrets = Object.fromEntries([...secrets].map(([key, secret]) => [key, composeExternalResource(stackName, key, secret.Spec?.Name)]))
  }

  return stringifyYaml(doc, { singleQuote: true })
}

function envObject(env: string[]) {
  const out: Record<string, string> = {}
  for (const entry of env) {
    const [key, ...rest] = String(entry).split('=')
    out[key] = rest.join('=')
  }
  return out
}

function composePort(port: any) {
  if (!port.target) return null
  const proto = port.protocol && port.protocol !== 'tcp' ? `/${port.protocol}` : ''
  return port.published ? `${port.published}:${port.target}${proto}` : `${port.target}${proto}`
}

function composeMount(stackName: string, mount: any) {
  if (!mount.Target) return null
  const source = mount.Source ? displayName(stackName, mount.Source) : ''
  const mode = mount.ReadOnly ? ':ro' : ''
  if (mount.Type === 'bind') return `${mount.Source}:${mount.Target}${mode}`
  if (mount.Type === 'volume') return `${source}:${mount.Target}${mode}`
  return {
    type: mount.Type,
    source: mount.Source,
    target: mount.Target,
    read_only: !!mount.ReadOnly
  }
}

function composeDeploy(service: any) {
  const spec = service.Spec || {}
  const template = spec.TaskTemplate || {}
  const deploy: any = {}
  if (spec.Mode?.Global) deploy.mode = 'global'
  else if (spec.Mode?.Replicated?.Replicas != null) deploy.replicas = spec.Mode.Replicated.Replicas

  const labels = Object.fromEntries(
    Object.entries(spec.Labels || {}).filter(([key]) => key !== STACK_LABEL)
  )
  if (Object.keys(labels).length) deploy.labels = labels

  const resources = template.Resources || {}
  const limits = resources.Limits || {}
  const reservations = resources.Reservations || {}
  const outResources: any = {}
  if (limits.NanoCPUs || limits.MemoryBytes) {
    outResources.limits = {}
    if (limits.NanoCPUs) outResources.limits.cpus = String(limits.NanoCPUs / 1e9)
    if (limits.MemoryBytes) outResources.limits.memory = String(limits.MemoryBytes)
  }
  if (reservations.NanoCPUs || reservations.MemoryBytes) {
    outResources.reservations = {}
    if (reservations.NanoCPUs) outResources.reservations.cpus = String(reservations.NanoCPUs / 1e9)
    if (reservations.MemoryBytes) outResources.reservations.memory = String(reservations.MemoryBytes)
  }
  if (Object.keys(outResources).length) deploy.resources = outResources

  if (template.RestartPolicy) {
    deploy.restart_policy = {
      condition: template.RestartPolicy.Condition,
      delay: nanos(template.RestartPolicy.Delay),
      max_attempts: template.RestartPolicy.MaxAttempts,
      window: nanos(template.RestartPolicy.Window)
    }
  }
  if (template.Placement?.Constraints?.length) {
    deploy.placement = { constraints: template.Placement.Constraints }
  }
  if (spec.UpdateConfig) {
    deploy.update_config = {
      parallelism: spec.UpdateConfig.Parallelism,
      delay: nanos(spec.UpdateConfig.Delay),
      order: spec.UpdateConfig.Order,
      failure_action: spec.UpdateConfig.FailureAction
    }
  }
  return compactObject(deploy)
}

function composeNetwork(stackName: string, key: string, network: any) {
  const fullName = network.Name || ''
  if (fullName && fullName !== `${stackName}_${key}`) {
    return { external: true, name: fullName }
  }
  const out: any = {}
  if (network.Driver) out.driver = network.Driver
  if (network.Attachable != null) out.attachable = !!network.Attachable
  return out
}

function composeVolume(stackName: string, key: string, volume: any) {
  const fullName = volume.Name || ''
  if (fullName && fullName !== `${stackName}_${key}`) {
    return { external: true, name: fullName }
  }
  return volume.Driver ? { driver: volume.Driver } : {}
}

function composeExternalResource(stackName: string, key: string, fullName?: string) {
  if (fullName && fullName !== `${stackName}_${key}`) return { external: true, name: fullName }
  return { external: true }
}

function compactObject(value: any): any {
  if (Array.isArray(value)) return value.map(compactObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, compactObject(v)])
      .filter(([, v]) => !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))
  )
}

function nanos(value?: number | null) {
  if (!value) return undefined
  if (value % 1e9 === 0) return `${value / 1e9}s`
  return `${value}ns`
}
