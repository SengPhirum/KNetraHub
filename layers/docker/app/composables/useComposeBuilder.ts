import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * Form <-> Compose YAML bridge for the stack deploy modal. The model here is
 * intentionally close to compose's own shape (arrays-of-objects instead of
 * keyed maps, for easy v-for'ing) so it round-trips through
 * server/utils/stack.ts's buildServiceSpec without surprises - anything the
 * Form can produce is exactly what a hand-written compose file could too.
 */

export interface PortModel { published: string; target: string; protocol: 'tcp' | 'udp'; mode: 'ingress' | 'host' }
export interface EnvModel { key: string; value: string }
export interface MountModel { type: 'volume' | 'bind'; source: string; target: string; readOnly: boolean }
export interface AttachmentModel { source: string; target: string; uid: string; gid: string; mode: string }
export interface LabelModel { key: string; value: string }

/** deploy.update_config / deploy.rollback_config - all fields optional ('' =
 *  not set, so the deploy block only emits what the user actually filled). */
export interface DeployStrategyModel {
  parallelism: string
  delay: string
  order: '' | 'stop-first' | 'start-first'
  failureAction: '' | 'continue' | 'pause' | 'rollback'
  monitor: string
  maxFailureRatio: string
}

export interface ServiceModel {
  /** Stable internal identity, independent of `key` (the editable compose
   *  service name) - lets the deploy modal keep the correct panel/nav item
   *  selected while the user is mid-edit renaming a service. */
  id: string
  key: string
  image: string
  command: string
  args: string
  hostname: string
  workingDir: string
  user: string
  mode: 'replicated' | 'global'
  replicas: number
  endpointMode: '' | 'vip' | 'dnsrr'
  ports: PortModel[]
  environment: EnvModel[]
  volumes: MountModel[]
  networks: string[]
  configs: AttachmentModel[]
  secrets: AttachmentModel[]
  labels: LabelModel[]
  serviceLabels: LabelModel[]
  limitCpus: string
  limitMemory: string
  limitPids: string
  reservationCpus: string
  reservationMemory: string
  restartCondition: 'any' | 'on-failure' | 'none'
  restartDelay: string
  restartMaxAttempts: string
  restartWindow: string
  updateConfig: DeployStrategyModel
  rollbackConfig: DeployStrategyModel
  placementConstraints: string[]
  placementPreferences: string[]
  maxReplicasPerNode: string
  healthcheckTest: string
  healthcheckInterval: string
  healthcheckTimeout: string
  healthcheckRetries: string
  healthcheckStartPeriod: string
}

export interface NetworkModel { key: string; driver: string; attachable: boolean; external: boolean; externalName: string }
export interface VolumeModel { key: string; driver: string; external: boolean; externalName: string }
export interface ConfigModel { key: string; external: boolean; externalName: string }
export interface SecretModel { key: string; external: boolean; externalName: string }

export interface ComposeModel {
  services: ServiceModel[]
  networks: NetworkModel[]
  volumes: VolumeModel[]
  configs: ConfigModel[]
  secrets: SecretModel[]
}

export function useComposeBuilder() {
  function emptyModel(): ComposeModel {
    return { services: [newService('app')], networks: [], volumes: [], configs: [], secrets: [] }
  }

  function newService(key: string, id?: string): ServiceModel {
    return {
      id: id || genId(),
      key,
      image: '',
      command: '',
      args: '',
      hostname: '',
      workingDir: '',
      user: '',
      mode: 'replicated',
      replicas: 1,
      endpointMode: '',
      ports: [],
      environment: [],
      volumes: [],
      networks: [],
      configs: [],
      secrets: [],
      labels: [],
      serviceLabels: [],
      limitCpus: '',
      limitMemory: '',
      limitPids: '',
      reservationCpus: '',
      reservationMemory: '',
      restartCondition: 'any',
      restartDelay: '',
      restartMaxAttempts: '',
      restartWindow: '',
      updateConfig: emptyStrategy(),
      rollbackConfig: emptyStrategy(),
      placementConstraints: [],
      placementPreferences: [],
      maxReplicasPerNode: '',
      healthcheckTest: '',
      healthcheckInterval: '',
      healthcheckTimeout: '',
      healthcheckRetries: '',
      healthcheckStartPeriod: ''
    }
  }

  function genId(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  function emptyStrategy(): DeployStrategyModel {
    return { parallelism: '', delay: '', order: '', failureAction: '', monitor: '', maxFailureRatio: '' }
  }

  function parseStrategy(cfg: any): DeployStrategyModel {
    const c = cfg || {}
    return {
      parallelism: c.parallelism != null ? String(c.parallelism) : '',
      delay: c.delay != null ? String(c.delay) : '',
      order: c.order === 'start-first' || c.order === 'stop-first' ? c.order : '',
      failureAction: ['continue', 'pause', 'rollback'].includes(c.failure_action) ? c.failure_action : '',
      monitor: c.monitor != null ? String(c.monitor) : '',
      maxFailureRatio: c.max_failure_ratio != null ? String(c.max_failure_ratio) : ''
    }
  }

  function strategyToYaml(s: DeployStrategyModel): Record<string, any> | null {
    const out = compact({
      parallelism: s.parallelism ? Number(s.parallelism) : undefined,
      delay: s.delay || undefined,
      failure_action: s.failureAction || undefined,
      monitor: s.monitor || undefined,
      max_failure_ratio: s.maxFailureRatio ? Number(s.maxFailureRatio) : undefined,
      order: s.order || undefined
    })
    return Object.keys(out).length ? out : null
  }

  function newNetwork(key: string): NetworkModel {
    return { key, driver: 'overlay', attachable: true, external: false, externalName: '' }
  }
  function newVolume(key: string): VolumeModel {
    return { key, driver: '', external: false, externalName: '' }
  }
  function newConfig(key: string): ConfigModel {
    return { key, external: false, externalName: '' }
  }
  function newSecret(key: string): SecretModel {
    return { key, external: false, externalName: '' }
  }

  /** Returns null if the YAML doesn't parse - caller should keep showing the
   *  last-good model rather than clobber it with a half-broken one.
   *  Pass the current model as `previous` so services that still exist under
   *  the same name keep their stable `id` (and thus the active nav/panel
   *  selection) across a YAML-tab edit. */
  function parseComposeToModel(yamlText: string, previous?: ComposeModel | null): ComposeModel | null {
    let doc: any
    try {
      doc = parseYaml(yamlText)
    } catch {
      return null
    }
    if (!doc || typeof doc !== 'object') return { services: [], networks: [], volumes: [], configs: [], secrets: [] }

    const services = Object.entries(doc.services || {}).map(([key, def]: [string, any]) =>
      parseService(key, def || {}, previous?.services.find((s) => s.key === key)?.id))
    const networks = Object.entries(doc.networks || {}).map(([key, def]: [string, any]) => {
      const d = def || {}
      return { key, driver: d.driver || 'overlay', attachable: d.attachable ?? true, external: !!d.external, externalName: (d.external && d.name) || '' }
    })
    const volumes = Object.entries(doc.volumes || {}).map(([key, def]: [string, any]) => {
      const d = def || {}
      return { key, driver: d.driver || '', external: !!d.external, externalName: (d.external && d.name) || '' }
    })
    const configs = Object.entries(doc.configs || {}).map(([key, def]: [string, any]) => {
      const d = def || {}
      return { key, external: !!d.external, externalName: (d.external && d.name) || '' }
    })
    const secrets = Object.entries(doc.secrets || {}).map(([key, def]: [string, any]) => {
      const d = def || {}
      return { key, external: !!d.external, externalName: (d.external && d.name) || '' }
    })

    return { services, networks, volumes, configs, secrets }
  }

  function parseService(key: string, def: any, id?: string): ServiceModel {
    const deploy = def.deploy || {}
    const resources = deploy.resources || {}
    const restart = deploy.restart_policy || {}
    const hc = def.healthcheck || {}

    return {
      id: id || genId(),
      key,
      image: def.image || '',
      command: arrToStr(def.command),
      args: arrToStr(def.args),
      hostname: def.hostname || '',
      workingDir: def.working_dir || '',
      user: def.user || '',
      mode: deploy.mode === 'global' ? 'global' : 'replicated',
      replicas: deploy.replicas != null ? Number(deploy.replicas) : 1,
      endpointMode: deploy.endpoint_mode === 'vip' || deploy.endpoint_mode === 'dnsrr' ? deploy.endpoint_mode : '',
      ports: (def.ports || []).map(parsePort),
      environment: parseEnv(def.environment),
      volumes: (def.volumes || []).map(parseMount),
      networks: Array.isArray(def.networks) ? def.networks.map(String) : Object.keys(def.networks || {}),
      configs: (def.configs || []).map(parseAttachment),
      secrets: (def.secrets || []).map(parseAttachment),
      labels: parseLabels(def.labels),
      serviceLabels: parseLabels(deploy.labels),
      limitCpus: resources.limits?.cpus != null ? String(resources.limits.cpus) : '',
      limitMemory: memoryToMb(resources.limits?.memory),
      limitPids: resources.limits?.pids != null ? String(resources.limits.pids) : '',
      reservationCpus: resources.reservations?.cpus != null ? String(resources.reservations.cpus) : '',
      reservationMemory: memoryToMb(resources.reservations?.memory),
      restartCondition: restart.condition === 'on-failure' || restart.condition === 'none' ? restart.condition : 'any',
      restartDelay: restart.delay != null ? String(restart.delay) : '',
      restartMaxAttempts: restart.max_attempts != null ? String(restart.max_attempts) : '',
      restartWindow: restart.window != null ? String(restart.window) : '',
      updateConfig: parseStrategy(deploy.update_config),
      rollbackConfig: parseStrategy(deploy.rollback_config),
      placementConstraints: (deploy.placement?.constraints || []).map(String),
      placementPreferences: (deploy.placement?.preferences || []).map((p: any) => String(p?.spread ?? p ?? '')).filter(Boolean),
      maxReplicasPerNode: deploy.placement?.max_replicas_per_node != null ? String(deploy.placement.max_replicas_per_node) : '',
      healthcheckTest: Array.isArray(hc.test) ? hc.test.slice(1).join(' ') : (hc.test || ''),
      healthcheckInterval: hc.interval != null ? String(hc.interval) : '',
      healthcheckTimeout: hc.timeout != null ? String(hc.timeout) : '',
      healthcheckRetries: hc.retries != null ? String(hc.retries) : '',
      healthcheckStartPeriod: hc.start_period != null ? String(hc.start_period) : ''
    }
  }

  function arrToStr(v: any): string {
    if (v == null) return ''
    return Array.isArray(v) ? v.join(' ') : String(v)
  }

  function parsePort(p: any): PortModel {
    if (typeof p === 'object') {
      return { published: p.published != null ? String(p.published) : '', target: String(p.target ?? ''), protocol: p.protocol === 'udp' ? 'udp' : 'tcp', mode: p.mode === 'host' ? 'host' : 'ingress' }
    }
    const str = String(p)
    const proto = str.includes('/udp') ? 'udp' : 'tcp'
    const parts = str.replace(/\/(tcp|udp)$/, '').split(':')
    return { published: parts.length > 1 ? parts[parts.length - 2]! : '', target: parts[parts.length - 1]!, protocol: proto, mode: 'ingress' }
  }

  function parseEnv(env: any): EnvModel[] {
    if (!env) return []
    if (Array.isArray(env)) return env.map((e) => { const [key, ...rest] = String(e).split('='); return { key, value: rest.join('=') } })
    return Object.entries(env).map(([key, value]) => ({ key, value: value == null ? '' : String(value) }))
  }

  function parseLabels(labels: any): LabelModel[] {
    if (!labels) return []
    if (Array.isArray(labels)) return labels.map((l) => { const [key, ...rest] = String(l).split('='); return { key, value: rest.join('=') } })
    return Object.entries(labels).map(([key, value]) => ({ key, value: value == null ? '' : String(value) }))
  }

  function parseMount(v: any): MountModel {
    if (typeof v === 'object') return { type: v.type === 'bind' ? 'bind' : 'volume', source: v.source || '', target: v.target || '', readOnly: !!v.read_only }
    const [source, target, mode] = String(v).split(':')
    const isBind = (source || '').startsWith('/') || (source || '').startsWith('.')
    return { type: isBind ? 'bind' : 'volume', source: source || '', target: target || '', readOnly: mode === 'ro' }
  }

  function parseAttachment(v: any): AttachmentModel {
    if (typeof v === 'object') return { source: v.source || '', target: v.target || '', uid: v.uid != null ? String(v.uid) : '', gid: v.gid != null ? String(v.gid) : '', mode: v.mode != null ? String(v.mode) : '' }
    return { source: String(v), target: '', uid: '', gid: '', mode: '' }
  }

  /** Emits long-form YAML throughout (objects, not shorthand strings) - always
   *  unambiguous, and matches exactly what parseComposeToModel reads back. */
  function modelToYaml(model: ComposeModel): string {
    const doc: any = { version: '3.8', services: {} }

    for (const svc of model.services) {
      if (!svc.key) continue
      const out: any = {}
      if (svc.image) out.image = svc.image
      if (svc.command) out.command = svc.command
      if (svc.args) out.args = svc.args.split(' ').filter(Boolean)
      if (svc.hostname) out.hostname = svc.hostname
      if (svc.workingDir) out.working_dir = svc.workingDir
      if (svc.user) out.user = svc.user
      // Filter half-filled rows first and only emit non-empty results - a row
      // the user just added (and hasn't typed into yet) must not leave
      // `environment: {}` / `ports: []` artifacts in the YAML.
      const environment = svc.environment.filter((e) => e.key)
      if (environment.length) out.environment = Object.fromEntries(environment.map((e) => [e.key, e.value]))
      const labels = svc.labels.filter((l) => l.key)
      if (labels.length) out.labels = Object.fromEntries(labels.map((l) => [l.key, l.value]))
      const ports = svc.ports.filter((p) => p.target)
      if (ports.length) {
        out.ports = ports.map((p) => ({
          target: Number(p.target),
          ...(p.published ? { published: Number(p.published) } : {}),
          protocol: p.protocol,
          mode: p.mode
        }))
      }
      if (svc.networks.length) out.networks = svc.networks
      const mounts = svc.volumes.filter((v) => v.source && v.target)
      if (mounts.length) {
        out.volumes = mounts.map((v) => ({ type: v.type, source: v.source, target: v.target, read_only: v.readOnly }))
      }
      const configs = svc.configs.filter((c) => c.source)
      if (configs.length) {
        out.configs = configs.map((c) => attachmentToYaml(c))
      }
      const secrets = svc.secrets.filter((s) => s.source)
      if (secrets.length) {
        out.secrets = secrets.map((s) => attachmentToYaml(s))
      }
      if (svc.healthcheckTest) {
        out.healthcheck = compact({
          test: ['CMD-SHELL', svc.healthcheckTest],
          interval: svc.healthcheckInterval || undefined,
          timeout: svc.healthcheckTimeout || undefined,
          retries: svc.healthcheckRetries ? Number(svc.healthcheckRetries) : undefined,
          start_period: svc.healthcheckStartPeriod || undefined
        })
      }

      const deploy: any = {}
      if (svc.mode === 'global') deploy.mode = 'global'
      else if (svc.replicas != null) deploy.replicas = svc.replicas
      if (svc.endpointMode) deploy.endpoint_mode = svc.endpointMode
      const serviceLabels = svc.serviceLabels.filter((l) => l.key)
      if (serviceLabels.length) deploy.labels = Object.fromEntries(serviceLabels.map((l) => [l.key, l.value]))
      const resources = compact({
        limits: compact({ cpus: svc.limitCpus || undefined, memory: svc.limitMemory ? `${svc.limitMemory}M` : undefined, pids: svc.limitPids ? Number(svc.limitPids) : undefined }),
        reservations: compact({ cpus: svc.reservationCpus || undefined, memory: svc.reservationMemory ? `${svc.reservationMemory}M` : undefined })
      })
      if (Object.keys(resources).length) deploy.resources = resources
      if (svc.restartCondition !== 'any' || svc.restartDelay || svc.restartMaxAttempts || svc.restartWindow) {
        deploy.restart_policy = compact({
          condition: svc.restartCondition,
          delay: svc.restartDelay || undefined,
          max_attempts: svc.restartMaxAttempts ? Number(svc.restartMaxAttempts) : undefined,
          window: svc.restartWindow || undefined
        })
      }
      const updateConfig = strategyToYaml(svc.updateConfig)
      if (updateConfig) deploy.update_config = updateConfig
      const rollbackConfig = strategyToYaml(svc.rollbackConfig)
      if (rollbackConfig) deploy.rollback_config = rollbackConfig
      const constraints = svc.placementConstraints.filter(Boolean)
      const preferences = svc.placementPreferences.filter(Boolean)
      const placement = compact({
        constraints: constraints.length ? constraints : undefined,
        preferences: preferences.length ? preferences.map((p) => ({ spread: p })) : undefined,
        max_replicas_per_node: svc.maxReplicasPerNode ? Number(svc.maxReplicasPerNode) : undefined
      })
      if (Object.keys(placement).length) deploy.placement = placement
      if (Object.keys(deploy).length) out.deploy = deploy

      doc.services[svc.key] = out
    }

    const networks = model.networks.filter((n) => n.key)
    if (networks.length) {
      doc.networks = Object.fromEntries(networks.map((n) => [n.key,
        n.external ? compact({ external: true, name: n.externalName || undefined }) : compact({ driver: n.driver || undefined, attachable: n.attachable })
      ]))
    }
    const volumes = model.volumes.filter((v) => v.key)
    if (volumes.length) {
      doc.volumes = Object.fromEntries(volumes.map((v) => [v.key,
        v.external ? compact({ external: true, name: v.externalName || undefined }) : compact({ driver: v.driver || undefined })
      ]))
    }
    const configs = model.configs.filter((c) => c.key)
    if (configs.length) {
      doc.configs = Object.fromEntries(configs.map((c) => [c.key,
        c.external ? compact({ external: true, name: c.externalName || undefined }) : {}
      ]))
    }
    const secrets = model.secrets.filter((s) => s.key)
    if (secrets.length) {
      doc.secrets = Object.fromEntries(secrets.map((s) => [s.key,
        s.external ? compact({ external: true, name: s.externalName || undefined }) : {}
      ]))
    }

    return stringifyYaml(doc, { singleQuote: true })
  }

  function attachmentToYaml(a: AttachmentModel) {
    if (!a.target && !a.uid && !a.gid && !a.mode) return a.source
    return compact({ source: a.source, target: a.target || undefined, uid: a.uid || undefined, gid: a.gid || undefined, mode: a.mode ? Number(a.mode) : undefined })
  }

  /** Normalize raw Compose memory values to the numeric MiB value shown in
   * the form. Unitless Compose values are bytes; M values are already MiB. */
  function memoryToMb(value: any): string {
    if (value == null || value === '') return ''
    const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i)
    if (!match) return ''
    const amount = Number(match[1])
    const unit = match[2]!.toLowerCase()
    const mb = unit === 't' ? amount * 1024 * 1024
      : unit === 'g' ? amount * 1024
        : unit === 'm' ? amount
          : unit === 'k' ? amount / 1024
            : amount / (1024 ** 2)
    return String(Number(mb.toFixed(3)))
  }

  function compact(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)))
  }

  return { emptyModel, newService, newNetwork, newVolume, newConfig, newSecret, parseComposeToModel, modelToYaml }
}
