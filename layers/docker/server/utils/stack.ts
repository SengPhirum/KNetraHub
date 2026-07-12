import { parse as parseYaml } from 'yaml'
import { useDocker } from '~~/layers/docker/server/utils/docker'

export const STACK_LABEL = 'com.docker.stack.namespace'

/* ----------------------------------------------------------------------------
 * Reading: group existing swarm objects into "stacks" by namespace label.
 * Docker's Engine API has no native stack object — `docker stack deploy` is a
 * client convention built on labels. KNetraHub follows the same convention.
 * --------------------------------------------------------------------------*/

export interface StackSummary {
  name: string
  services: number
  networks: number
  volumes: number
  configs: number
  secrets: number
  runningTasks: number
  desiredTasks: number
  updatedAt: string | null
}

export async function listStacks(): Promise<StackSummary[]> {
  const docker = useDocker()
  const [services, networks, volumeList, configs, secrets, tasks] = await Promise.all([
    docker.listServices(),
    docker.listNetworks(),
    docker.listVolumes().catch(() => ({ Volumes: [] })),
    docker.listConfigs().catch(() => []),
    docker.listSecrets().catch(() => []),
    docker.listTasks().catch(() => [])
  ])
  const volumes = (volumeList as any)?.Volumes || []

  const map = new Map<string, StackSummary>()
  const ensure = (name: string) =>
    map.get(name) ||
    map.set(name, {
      name,
      services: 0,
      networks: 0,
      volumes: 0,
      configs: 0,
      secrets: 0,
      runningTasks: 0,
      desiredTasks: 0,
      updatedAt: null
    }).get(name)!

  const stackByServiceId = new Map<string, string>()
  const globalServiceIds = new Set<string>()
  for (const s of services) {
    const ns = s.Spec?.Labels?.[STACK_LABEL]
    if (!ns) continue
    const e = ensure(ns)
    e.services++
    if (s.ID) stackByServiceId.set(s.ID, ns)
    // Global services have no replica count - their desired total is counted
    // from the tasks the scheduler actually placed (one per eligible node),
    // in the task loop below.
    if (s.Spec?.Mode?.Global) {
      if (s.ID) globalServiceIds.add(s.ID)
    } else {
      const replicas = s.Spec?.Mode?.Replicated?.Replicas
      if (typeof replicas === 'number') e.desiredTasks += replicas
    }
    if (s.UpdatedAt && (!e.updatedAt || s.UpdatedAt > e.updatedAt)) e.updatedAt = s.UpdatedAt
  }
  for (const n of networks) {
    const ns = n.Labels?.[STACK_LABEL]
    if (ns) ensure(ns).networks++
  }
  for (const v of volumes as any[]) {
    const ns = v.Labels?.[STACK_LABEL]
    if (ns) ensure(ns).volumes++
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
    // Resolve the task's stack via its service first - container labels are
    // absent on tasks of stacks deployed by tools that only label the service.
    const ns = stackByServiceId.get(t.ServiceID) || t.Spec?.ContainerSpec?.Labels?.[STACK_LABEL] || t.Labels?.[STACK_LABEL]
    if (!ns || !map.has(ns)) continue
    if (t.Status?.State === 'running') ensure(ns).runningTasks++
    if (globalServiceIds.has(t.ServiceID) && t.DesiredState !== 'shutdown' && t.Status?.State !== 'shutdown') {
      ensure(ns).desiredTasks++
    }
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

/** A non-external secret/config the compose declares that Docker doesn't
 *  already have under this stack - the deploy UI must collect its content
 *  from the user (via a popup) and pass it back as secretsContent/
 *  configsContent before deploy will succeed. */
export interface NeededResource {
  key: string
  fullName: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  needsSecrets: NeededResource[]
  needsConfigs: NeededResource[]
}

/** Pure structural checks - no Docker API calls. Fast enough to run on every
 *  keystroke for live feedback in the deploy form. */
export function validateComposeStructure(stackName: string, composeText: string): { compose: any; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  if (!stackName || !/^[a-z0-9][a-z0-9_-]*$/i.test(stackName)) {
    errors.push('Stack name must start with a letter/number and contain only letters, numbers, "_" or "-".')
  }

  let compose: any = {}
  try {
    compose = parseYaml(composeText) || {}
  } catch (err: any) {
    errors.push(`Compose file is not valid YAML: ${err?.message || err}`)
    return { compose: {}, errors, warnings }
  }

  const services: Record<string, any> = compose.services || {}
  if (Object.keys(services).length === 0) {
    errors.push('Compose file has no services.')
  }
  for (const [key, def] of Object.entries(services)) {
    if (!def || typeof def !== 'object') { errors.push(`Service "${key}" has no definition.`); continue }
    if (!(def as any).image) errors.push(`Service "${key}" is missing an image.`)
    const deploy = (def as any).deploy || {}
    if (deploy.replicas != null && (!Number.isFinite(Number(deploy.replicas)) || Number(deploy.replicas) < 0)) {
      errors.push(`Service "${key}" has an invalid replica count.`)
    }
    for (const p of (def as any).ports || []) {
      const target = typeof p === 'object' ? p.target : String(p).split(':').pop()
      if (!target || !Number.isFinite(Number(target))) warnings.push(`Service "${key}" has a port entry with no valid target port.`)
    }
    for (const netKey of Array.isArray((def as any).networks) ? (def as any).networks : Object.keys((def as any).networks || {})) {
      if (!compose.networks?.[netKey]) warnings.push(`Service "${key}" references undefined network "${netKey}".`)
    }
    for (const c of (def as any).configs || []) {
      const source = typeof c === 'string' ? c : c.source
      if (source && !compose.configs?.[source]) errors.push(`Service "${key}" references undefined config "${source}".`)
    }
    for (const s of (def as any).secrets || []) {
      const source = typeof s === 'string' ? s : s.source
      if (source && !compose.secrets?.[source]) errors.push(`Service "${key}" references undefined secret "${source}".`)
    }
  }

  return { compose, errors, warnings }
}

/** Live Docker-state checks: which external networks/configs/secrets are
 *  missing, and which non-external configs/secrets still need their content
 *  collected from the user before they can be auto-created at deploy time. */
export async function checkComposeAgainstDocker(stackName: string, compose: any): Promise<{ warnings: string[]; needsSecrets: NeededResource[]; needsConfigs: NeededResource[] }> {
  const docker = useDocker()
  const warnings: string[] = []
  const needsSecrets: NeededResource[] = []
  const needsConfigs: NeededResource[] = []

  const composeNetworks: Record<string, any> = compose.networks || {}
  for (const [key, netDef] of Object.entries(composeNetworks)) {
    const def: any = netDef || {}
    if (!def.external) continue
    const found = await docker.listNetworks({ filters: JSON.stringify({ name: [String(def.name || key)] }) }).catch(() => [])
    if (!found[0]) warnings.push(`External network "${key}" not found.`)
  }

  const composeSecrets: Record<string, any> = compose.secrets || {}
  const existingSecrets = await docker.listSecrets().catch(() => [])
  for (const [key, def] of Object.entries(composeSecrets)) {
    const d: any = def || {}
    const fullName = d.external ? String(d.name || key) : `${stackName}_${key}`
    const found = (existingSecrets as any[]).some((s) => s.Spec?.Name === fullName)
    if (d.external) { if (!found) warnings.push(`External secret "${key}" not found.`) }
    else if (!found) needsSecrets.push({ key, fullName })
  }

  const composeConfigs: Record<string, any> = compose.configs || {}
  const existingConfigs = await docker.listConfigs().catch(() => [])
  for (const [key, def] of Object.entries(composeConfigs)) {
    const d: any = def || {}
    const fullName = d.external ? String(d.name || key) : `${stackName}_${key}`
    const found = (existingConfigs as any[]).some((c) => c.Spec?.Name === fullName)
    if (d.external) { if (!found) warnings.push(`External config "${key}" not found.`) }
    else if (!found) needsConfigs.push({ key, fullName })
  }

  return { warnings, needsSecrets, needsConfigs }
}

export interface DeployOptions {
  /** Content for non-external secrets the compose declares that don't
   *  already exist in Docker under `${stackName}_<key>` - collected from the
   *  user via the deploy popup. Keyed by the compose secret key. */
  secretsContent?: Record<string, string>
  configsContent?: Record<string, string>
}

export async function deployStack(stackName: string, composeText: string, options: DeployOptions = {}): Promise<DeployResult> {
  const docker = useDocker()
  const { compose, errors } = validateComposeStructure(stackName, composeText)
  if (errors.length) throw createError({ statusCode: 400, statusMessage: errors[0] })

  const warnings: string[] = []
  const result: DeployResult = { stack: stackName, created: [], updated: [], networks: [], warnings }

  const composeServices: Record<string, any> = compose.services || {}
  const composeNetworks: Record<string, any> = compose.networks || {}
  const composeSecrets: Record<string, any> = compose.secrets || {}
  const composeConfigs: Record<string, any> = compose.configs || {}

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

  // 1a. Default network semantics from `docker stack deploy`: services that
  // list no networks join the stack's "default" overlay network. Without it,
  // two services in the same stack share no network at all and can't resolve
  // each other by name (UnknownHostException on the other service's hostname).
  const needsDefaultNetwork = Object.values(composeServices).some((def: any) => {
    const nets = def?.networks
    return !nets || (Array.isArray(nets) ? nets.length === 0 : Object.keys(nets).length === 0)
  })
  if (needsDefaultNetwork && !netNameToId.has('default')) {
    const fullName = `${stackName}_default`
    const found = existingNetworks.find((n) => n.Name === fullName)
    if (found) {
      netNameToId.set('default', found.Id)
    } else {
      const created = await docker.createNetwork({
        Name: fullName,
        Driver: 'overlay',
        Attachable: true,
        Labels: { [STACK_LABEL]: stackName }
      })
      netNameToId.set('default', created.id)
      result.networks.push(fullName)
    }
  }

  // 1b. Ensure secrets/configs - external ones must already exist; non-external
  // ones are auto-created here from user-supplied content (see DeployOptions),
  // the same way `docker stack deploy` expects a `file:` on disk, except a
  // browser has no filesystem to read one from.
  const secretNameToId = await ensureNamedResources({
    kind: 'secret',
    stackName,
    entries: composeSecrets,
    content: options.secretsContent || {},
    list: () => docker.listSecrets(),
    create: (Name, Data, Labels) => docker.createSecret({ Name, Data, Labels }),
    warnings
  })
  const configNameToId = await ensureNamedResources({
    kind: 'config',
    stackName,
    entries: composeConfigs,
    content: options.configsContent || {},
    list: () => docker.listConfigs(),
    create: (Name, Data, Labels) => docker.createConfig({ Name, Data, Labels }),
    warnings
  })

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
    const spec = buildServiceSpec(stackName, svcKey, serviceName, svcDef, netNameToId, configNameToId, secretNameToId, warnings)

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

async function ensureNamedResources(opts: {
  kind: 'secret' | 'config'
  stackName: string
  entries: Record<string, any>
  content: Record<string, string>
  list: () => Promise<any[]>
  create: (Name: string, Data: string, Labels: Record<string, string>) => Promise<any>
  warnings: string[]
}): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>()
  if (!Object.keys(opts.entries).length) return nameToId
  const existing = await opts.list().catch(() => [])

  for (const [key, def] of Object.entries(opts.entries)) {
    const d: any = def || {}
    if (d.external) {
      const fullName = String(d.name || key)
      const found = (existing as any[]).find((r) => r.Spec?.Name === fullName)
      if (found) nameToId.set(key, found.ID)
      else opts.warnings.push(`External ${opts.kind} "${key}" not found`)
      continue
    }

    const fullName = `${opts.stackName}_${key}`
    const found = (existing as any[]).find((r) => r.Spec?.Name === fullName)
    if (found) { nameToId.set(key, found.ID); continue }

    const content = opts.content[key]
    if (content == null) {
      throw createError({ statusCode: 400, statusMessage: `Missing content for ${opts.kind} "${key}" - it must be created before deploy.` })
    }
    const created = await opts.create(fullName, Buffer.from(content, 'utf8').toString('base64'), { [STACK_LABEL]: opts.stackName })
    nameToId.set(key, (created as any).id || (created as any).ID)
  }

  return nameToId
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
  configNameToId: Map<string, string>,
  secretNameToId: Map<string, string>,
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
  const Networks = normalizeServiceNetworks(def.networks, netNameToId, svcKey, warnings)

  // mounts
  const Mounts = normalizeMounts(def.volumes, warnings)

  // configs/secrets
  const Configs = normalizeAttachments(def.configs, configNameToId, 'config', warnings)
  const Secrets = normalizeAttachments(def.secrets, secretNameToId, 'secret', warnings)

  // resources
  const Resources = normalizeResources(deploy.resources)

  // restart policy
  const RestartPolicy = normalizeRestart(deploy.restart_policy)

  // placement
  const Placement = normalizePlacement(deploy.placement)

  // update / rollback config (same shape in both the compose file and the API)
  const UpdateConfig = normalizeChangeConfig(deploy.update_config)
  const RollbackConfig = normalizeChangeConfig(deploy.rollback_config)

  // endpoint mode (vip is the engine default; dnsrr disables the virtual IP)
  const endpointMode = deploy.endpoint_mode === 'dnsrr' || deploy.endpoint_mode === 'vip' ? deploy.endpoint_mode : undefined

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
        Healthcheck,
        Configs,
        Secrets
      },
      Resources,
      RestartPolicy,
      Placement,
      Networks
    },
    Mode,
    UpdateConfig,
    RollbackConfig,
    EndpointSpec: ports.length || endpointMode
      ? { Mode: endpointMode, Ports: ports.length ? ports : undefined }
      : undefined
  }
}

function normalizePlacement(p: any) {
  if (!p) return undefined
  const out: any = {}
  if (p.constraints) out.Constraints = ([] as string[]).concat(p.constraints)
  if (p.preferences) {
    out.Preferences = ([] as any[])
      .concat(p.preferences)
      .map((pref) => ({ Spread: { SpreadDescriptor: String(pref?.spread ?? pref) } }))
  }
  if (p.max_replicas_per_node != null) out.MaxReplicas = Number(p.max_replicas_per_node)
  return Object.keys(out).length ? out : undefined
}

// deploy.update_config / deploy.rollback_config -> UpdateConfig/RollbackConfig
function normalizeChangeConfig(cfg: any) {
  if (!cfg) return undefined
  return {
    Parallelism: cfg.parallelism != null ? Number(cfg.parallelism) : 1,
    Delay: parseDuration(cfg.delay),
    Order: cfg.order || 'stop-first',
    FailureAction: cfg.failure_action || 'pause',
    Monitor: parseDuration(cfg.monitor),
    MaxFailureRatio: cfg.max_failure_ratio != null ? Number(cfg.max_failure_ratio) : undefined
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

function normalizeServiceNetworks(nets: any, netNameToId: Map<string, string>, svcKey: string, warnings: string[]) {
  // `docker stack deploy` registers the bare compose service name as a network
  // alias on every attachment - that's what lets one service reach another as
  // "postgres-db" instead of only "<stack>_postgres-db". Without the alias,
  // cross-service DNS by compose name fails (UnknownHostException).
  const attach = (id: string) => ({ Target: id, Aliases: [svcKey] })
  const keys = Array.isArray(nets) ? nets : Object.keys(nets || {})
  if (!keys.length) {
    // No explicit networks -> the stack's default network (compose semantics),
    // falling back to the first declared network for older deploys.
    const fallback = netNameToId.get('default') || [...netNameToId.values()][0]
    return fallback ? [attach(fallback)] : undefined
  }
  const out: any[] = []
  for (const k of keys) {
    const id = netNameToId.get(String(k))
    if (id) out.push(attach(id))
    else warnings.push(`Service references unknown network "${k}"`)
  }
  return out.length ? out : undefined
}

// Compose service `configs:`/`secrets:` entries - short form (a bare name
// referencing the top-level entry) or long form ({source, target, uid, gid,
// mode}). `nameToId` maps the top-level key to the actual Docker object id
// created/resolved during the ensure-step in deployStack.
function normalizeAttachments(entries: any, nameToId: Map<string, string>, kind: 'config' | 'secret', warnings: string[]) {
  if (!entries) return undefined
  const out: any[] = []
  for (const entry of entries) {
    const isLong = typeof entry === 'object'
    const source = isLong ? entry.source : String(entry)
    const id = nameToId.get(source)
    if (!id) { warnings.push(`Service references unknown ${kind} "${source}"`); continue }
    const target = isLong ? entry.target : undefined
    const file = {
      Name: target || `/${source}`,
      UID: isLong && entry.uid != null ? String(entry.uid) : '0',
      GID: isLong && entry.gid != null ? String(entry.gid) : '0',
      Mode: isLong && entry.mode != null ? Number(entry.mode) : 0o444
    }
    out.push(kind === 'config' ? { ConfigID: id, ConfigName: source, File: file } : { SecretID: id, SecretName: source, File: file })
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
      MemoryBytes: parseBytes(resources.limits.memory),
      Pids: resources.limits.pids != null ? Number(resources.limits.pids) : undefined
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
