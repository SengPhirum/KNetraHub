import { parse as parseYaml } from 'yaml'
import { useDocker } from './docker'

export const STACK_LABEL = 'com.docker.stack.namespace'

/* ----------------------------------------------------------------------------
 * Reading: group existing swarm objects into "stacks" by namespace label.
 * Docker's Engine API has no native stack object — `docker stack deploy` is a
 * client convention built on labels. DockHub follows the same convention.
 * --------------------------------------------------------------------------*/

export interface StackSummary {
  name: string
  services: number
  networks: number
  configs: number
  secrets: number
  runningTasks: number
  desiredTasks: number
}

export async function listStacks(): Promise<StackSummary[]> {
  const docker = useDocker()
  const [services, networks, configs, secrets, tasks] = await Promise.all([
    docker.listServices(),
    docker.listNetworks(),
    docker.listConfigs().catch(() => []),
    docker.listSecrets().catch(() => []),
    docker.listTasks().catch(() => [])
  ])

  const map = new Map<string, StackSummary>()
  const ensure = (name: string) =>
    map.get(name) ||
    map.set(name, {
      name,
      services: 0,
      networks: 0,
      configs: 0,
      secrets: 0,
      runningTasks: 0,
      desiredTasks: 0
    }).get(name)!

  for (const s of services) {
    const ns = s.Spec?.Labels?.[STACK_LABEL]
    if (!ns) continue
    const e = ensure(ns)
    e.services++
    const replicas = s.Spec?.Mode?.Replicated?.Replicas
    if (typeof replicas === 'number') e.desiredTasks += replicas
  }
  for (const n of networks) {
    const ns = n.Labels?.[STACK_LABEL]
    if (ns) ensure(ns).networks++
  }
  for (const c of configs as any[]) {
    const ns = c.Spec?.Labels?.[STACK_LABEL]
    if (ns) ensure(ns).configs++
  }
  for (const sec of secrets as any[]) {
    const ns = sec.Spec?.Labels?.[STACK_LABEL]
    if (ns) ensure(ns).secrets++
  }
  for (const t of tasks as any[]) {
    const ns = t.Spec?.ContainerSpec?.Labels?.[STACK_LABEL] || t.Labels?.[STACK_LABEL]
    if (ns && map.has(ns) && t.Status?.State === 'running') ensure(ns).runningTasks++
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function stackServices(name: string) {
  const docker = useDocker()
  const services = await docker.listServices({
    filters: JSON.stringify({ label: [`${STACK_LABEL}=${name}`] })
  })
  return services
}

/* ----------------------------------------------------------------------------
 * Writing: deploy a compose file as a swarm stack.
 * Covers the common compose subset. Unsupported keys are ignored rather than
 * failing the whole deploy, and reported back to the caller.
 * --------------------------------------------------------------------------*/

export interface DeployResult {
  stack: string
  created: string[]
  updated: string[]
  networks: string[]
  warnings: string[]
}

export async function deployStack(stackName: string, composeText: string): Promise<DeployResult> {
  const docker = useDocker()
  const compose = parseYaml(composeText) || {}
  const warnings: string[] = []
  const result: DeployResult = { stack: stackName, created: [], updated: [], networks: [], warnings }

  const composeServices: Record<string, any> = compose.services || {}
  const composeNetworks: Record<string, any> = compose.networks || {}

  if (Object.keys(composeServices).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Compose file has no services' })
  }

  // 1. Ensure networks
  const existingNetworks = await docker.listNetworks()
  const netNameToId = new Map<string, string>()
  for (const [netKey, netDef] of Object.entries(composeNetworks)) {
    const def = netDef || {}
    if (def.external) {
      const ext = await docker.listNetworks({ filters: JSON.stringify({ name: [String(def.name || netKey)] }) })
      if (ext[0]) netNameToId.set(netKey, ext[0].Id)
      else warnings.push(`External network "${netKey}" not found`)
      continue
    }
    const fullName = `${stackName}_${netKey}`
    const found = existingNetworks.find((n) => n.Name === fullName)
    if (found) {
      netNameToId.set(netKey, found.Id)
      continue
    }
    const created = await docker.createNetwork({
      Name: fullName,
      Driver: def.driver || 'overlay',
      Attachable: def.attachable ?? true,
      Labels: { [STACK_LABEL]: stackName }
    })
    netNameToId.set(netKey, created.id)
    result.networks.push(fullName)
  }

  // 2. Existing services in this stack (for update vs create + pruning)
  const current = await docker.listServices({
    filters: JSON.stringify({ label: [`${STACK_LABEL}=${stackName}`] })
  })
  const currentByName = new Map(current.map((s) => [s.Spec!.Name!, s]))
  const desiredNames = new Set<string>()

  // 3. Create / update each service
  for (const [svcKey, svcDef] of Object.entries(composeServices)) {
    const serviceName = `${stackName}_${svcKey}`
    desiredNames.add(serviceName)
    const spec = buildServiceSpec(stackName, svcKey, serviceName, svcDef, netNameToId, warnings)

    const existing = currentByName.get(serviceName)
    if (existing) {
      const inspect = await docker.getService(existing.ID!).inspect()
      await docker.getService(existing.ID!).update({
        version: inspect.Version.Index,
        ...spec
      })
      result.updated.push(serviceName)
    } else {
      await docker.createService(spec)
      result.created.push(serviceName)
    }
  }

  // 4. Prune services removed from the compose
  for (const [name, svc] of currentByName) {
    if (!desiredNames.has(name)) {
      await docker.getService(svc.ID!).remove()
      warnings.push(`Removed service "${name}" (no longer in compose)`)
    }
  }

  return result
}

export async function removeStack(stackName: string) {
  const docker = useDocker()
  const filter = JSON.stringify({ label: [`${STACK_LABEL}=${stackName}`] })
  const [services, networks, configs, secrets] = await Promise.all([
    docker.listServices({ filters: filter }),
    docker.listNetworks({ filters: filter }),
    docker.listConfigs({ filters: filter }).catch(() => []),
    docker.listSecrets({ filters: filter }).catch(() => [])
  ])
  for (const s of services) await docker.getService(s.ID!).remove().catch(() => {})
  for (const n of networks) await docker.getNetwork(n.Id).remove().catch(() => {})
  for (const c of configs as any[]) await docker.getConfig(c.ID).remove().catch(() => {})
  for (const sec of secrets as any[]) await docker.getSecret(sec.ID).remove().catch(() => {})
  return { removedServices: services.length, removedNetworks: networks.length }
}

/* ----------------------------- spec builder ------------------------------ */

function buildServiceSpec(
  stack: string,
  svcKey: string,
  serviceName: string,
  def: any,
  netNameToId: Map<string, string>,
  warnings: string[]
) {
  const deploy = def.deploy || {}

  // mode
  let Mode: any = { Replicated: { Replicas: 1 } }
  if (deploy.mode === 'global') Mode = { Global: {} }
  else if (deploy.replicas != null) Mode = { Replicated: { Replicas: Number(deploy.replicas) } }

  // env
  const Env = normalizeEnv(def.environment)

  // labels
  const stackLabels = { [STACK_LABEL]: stack }
  const ContainerLabels = { ...objLabels(def.labels), ...stackLabels }
  const ServiceLabels = { ...objLabels(deploy.labels), ...stackLabels }

  // ports
  const ports = normalizePorts(def.ports, warnings)

  // networks
  const Networks = normalizeServiceNetworks(def.networks, netNameToId, warnings)

  // mounts
  const Mounts = normalizeMounts(def.volumes, warnings)

  // resources
  const Resources = normalizeResources(deploy.resources)

  // restart policy
  const RestartPolicy = normalizeRestart(deploy.restart_policy)

  // placement
  const Placement = deploy.placement?.constraints
    ? { Constraints: ([] as string[]).concat(deploy.placement.constraints) }
    : undefined

  // update config
  const UpdateConfig = deploy.update_config
    ? {
        Parallelism: deploy.update_config.parallelism ?? 1,
        Delay: parseDuration(deploy.update_config.delay),
        Order: deploy.update_config.order || 'stop-first',
        FailureAction: deploy.update_config.failure_action || 'pause'
      }
    : undefined

  // healthcheck
  const Healthcheck = normalizeHealthcheck(def.healthcheck)

  return {
    Name: serviceName,
    Labels: ServiceLabels,
    TaskTemplate: {
      ContainerSpec: {
        Image: def.image,
        Command: toArray(def.command),
        Args: toArray(def.args),
        Env,
        Labels: ContainerLabels,
        Hostname: def.hostname,
        Dir: def.working_dir,
        User: def.user,
        Mounts,
        Healthcheck
      },
      Resources,
      RestartPolicy,
      Placement,
      Networks
    },
    Mode,
    UpdateConfig,
    EndpointSpec: ports.length ? { Ports: ports } : undefined
  }
}

/* ------------------------------- helpers --------------------------------- */

function toArray(v: any): string[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) return v.map(String)
  return String(v).split(' ').filter(Boolean)
}

function normalizeEnv(env: any): string[] | undefined {
  if (!env) return undefined
  if (Array.isArray(env)) return env.map(String)
  return Object.entries(env).map(([k, v]) => `${k}=${v ?? ''}`)
}

function objLabels(labels: any): Record<string, string> {
  if (!labels) return {}
  if (Array.isArray(labels)) {
    const o: Record<string, string> = {}
    for (const l of labels) {
      const [k, ...rest] = String(l).split('=')
      o[k] = rest.join('=')
    }
    return o
  }
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries(labels)) o[k] = String(v ?? '')
  return o
}

function normalizePorts(ports: any, warnings: string[]) {
  if (!ports) return []
  const out: any[] = []
  for (const p of ports) {
    if (typeof p === 'string' || typeof p === 'number') {
      const parts = String(p).split(':')
      const target = Number(parts[parts.length - 1])
      const published = parts.length > 1 ? Number(parts[parts.length - 2]) : undefined
      out.push({
        Protocol: String(p).includes('/udp') ? 'udp' : 'tcp',
        TargetPort: target,
        PublishedPort: published,
        PublishMode: 'ingress'
      })
    } else if (typeof p === 'object') {
      out.push({
        Protocol: p.protocol || 'tcp',
        TargetPort: Number(p.target),
        PublishedPort: p.published != null ? Number(p.published) : undefined,
        PublishMode: p.mode === 'host' ? 'host' : 'ingress'
      })
    }
  }
  return out
}

function normalizeServiceNetworks(nets: any, netNameToId: Map<string, string>, warnings: string[]) {
  if (!nets) return netNameToId.size ? [{ Target: [...netNameToId.values()][0] }] : undefined
  const keys = Array.isArray(nets) ? nets : Object.keys(nets)
  const out: any[] = []
  for (const k of keys) {
    const id = netNameToId.get(String(k))
    if (id) out.push({ Target: id })
    else warnings.push(`Service references unknown network "${k}"`)
  }
  return out.length ? out : undefined
}

function normalizeMounts(volumes: any, warnings: string[]) {
  if (!volumes) return undefined
  const out: any[] = []
  for (const v of volumes) {
    if (typeof v === 'string') {
      const [source, target, mode] = v.split(':')
      const isBind = source.startsWith('/') || source.startsWith('.')
      out.push({
        Type: isBind ? 'bind' : 'volume',
        Source: source,
        Target: target || source,
        ReadOnly: mode === 'ro'
      })
    } else if (typeof v === 'object') {
      out.push({
        Type: v.type || 'volume',
        Source: v.source,
        Target: v.target,
        ReadOnly: v.read_only || false
      })
    }
  }
  return out
}

function normalizeResources(resources: any) {
  if (!resources) return undefined
  const out: any = {}
  if (resources.limits) {
    out.Limits = {
      NanoCPUs: resources.limits.cpus ? Math.round(Number(resources.limits.cpus) * 1e9) : undefined,
      MemoryBytes: parseBytes(resources.limits.memory)
    }
  }
  if (resources.reservations) {
    out.Reservations = {
      NanoCPUs: resources.reservations.cpus ? Math.round(Number(resources.reservations.cpus) * 1e9) : undefined,
      MemoryBytes: parseBytes(resources.reservations.memory)
    }
  }
  return out
}

function normalizeRestart(rp: any) {
  if (!rp) return undefined
  return {
    Condition: rp.condition || 'any',
    Delay: parseDuration(rp.delay),
    MaxAttempts: rp.max_attempts != null ? Number(rp.max_attempts) : undefined,
    Window: parseDuration(rp.window)
  }
}

function normalizeHealthcheck(hc: any) {
  if (!hc) return undefined
  return {
    Test: Array.isArray(hc.test) ? hc.test : hc.test ? ['CMD-SHELL', hc.test] : undefined,
    Interval: parseDuration(hc.interval),
    Timeout: parseDuration(hc.timeout),
    Retries: hc.retries,
    StartPeriod: parseDuration(hc.start_period)
  }
}

// compose durations ("30s", "1m30s") -> nanoseconds
function parseDuration(d: any): number | undefined {
  if (d == null) return undefined
  if (typeof d === 'number') return d * 1e9
  const m = String(d).match(/(\d+)(ns|us|ms|s|m|h)?/g)
  if (!m) return undefined
  let ns = 0
  for (const part of m) {
    const num = parseInt(part)
    if (part.endsWith('ms')) ns += num * 1e6
    else if (part.endsWith('us')) ns += num * 1e3
    else if (part.endsWith('ns')) ns += num
    else if (part.endsWith('h')) ns += num * 3600 * 1e9
    else if (part.endsWith('m')) ns += num * 60 * 1e9
    else ns += num * 1e9
  }
  return ns
}

// "512M", "1g" -> bytes
function parseBytes(v: any): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return v
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i)
  if (!m) return undefined
  const n = parseFloat(m[1])
  const unit = m[2].toLowerCase()
  const mult: Record<string, number> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }
  return Math.round(n * (mult[unit] ?? 1))
}
