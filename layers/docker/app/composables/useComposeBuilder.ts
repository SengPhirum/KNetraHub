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
  reservationCpus: string
  reservationMemory: string
  restartCondition: 'any' | 'on-failure' | 'none'
  restartDelay: string
  restartMaxAttempts: string
  restartWindow: string
  placementConstraints: string[]
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
      reservationCpus: '',
      reservationMemory: '',
      restartCondition: 'any',
      restartDelay: '',
      restartMaxAttempts: '',
      restartWindow: '',
      placementConstraints: [],
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
      ports: (def.ports || []).map(parsePort),
      environment: parseEnv(def.environment),
      volumes: (def.volumes || []).map(parseMount),
      networks: Array.isArray(def.networks) ? def.networks.map(String) : Object.keys(def.networks || {}),
      configs: (def.configs || []).map(parseAttachment),
      secrets: (def.secrets || []).map(parseAttachment),
      labels: parseLabels(def.labels),
      serviceLabels: parseLabels(deploy.labels),
      limitCpus: resources.limits?.cpus != null ? String(resources.limits.cpus) : '',
      limitMemory: resources.limits?.memory != null ? String(resources.limits.memory) : '',
      reservationCpus: resources.reservations?.cpus != null ? String(resources.reservations.cpus) : '',
      reservationMemory: resources.reservations?.memory != null ? String(resources.reservations.memory) : '',
      restartCondition: restart.condition === 'on-failure' || restart.condition === 'none' ? restart.condition : 'any',
      restartDelay: restart.delay != null ? String(restart.delay) : '',
      restartMaxAttempts: restart.max_attempts != null ? String(restart.max_attempts) : '',
      restartWindow: restart.window != null ? String(restart.window) : '',
      placementConstraints: (deploy.placement?.constraints || []).map(String),
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
      if (svc.environment.length) out.environment = Object.fromEntries(svc.environment.filter((e) => e.key).map((e) => [e.key, e.value]))
      if (svc.labels.length) out.labels = Object.fromEntries(svc.labels.filter((l) => l.key).map((l) => [l.key, l.value]))
      if (svc.ports.length) {
        out.ports = svc.ports.filter((p) => p.target).map((p) => ({
          target: Number(p.target),
          ...(p.published ? { published: Number(p.published) } : {}),
          protocol: p.protocol,
          mode: p.mode
        }))
      }
      if (svc.networks.length) out.networks = svc.networks
      if (svc.volumes.length) {
        out.volumes = svc.volumes.filter((v) => v.source && v.target).map((v) => ({ type: v.type, source: v.source, target: v.target, read_only: v.readOnly }))
      }
      if (svc.configs.length) {
        out.configs = svc.configs.filter((c) => c.source).map((c) => attachmentToYaml(c))
      }
      if (svc.secrets.length) {
        out.secrets = svc.secrets.filter((s) => s.source).map((s) => attachmentToYaml(s))
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
      if (svc.serviceLabels.length) deploy.labels = Object.fromEntries(svc.serviceLabels.filter((l) => l.key).map((l) => [l.key, l.value]))
      const resources = compact({
        limits: compact({ cpus: svc.limitCpus || undefined, memory: svc.limitMemory || undefined }),
        reservations: compact({ cpus: svc.reservationCpus || undefined, memory: svc.reservationMemory || undefined })
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
      if (svc.placementConstraints.length) deploy.placement = { constraints: svc.placementConstraints.filter(Boolean) }
      if (Object.keys(deploy).length) out.deploy = deploy

      doc.services[svc.key] = out
    }

    if (model.networks.length) {
      doc.networks = Object.fromEntries(model.networks.filter((n) => n.key).map((n) => [n.key,
        n.external ? compact({ external: true, name: n.externalName || undefined }) : compact({ driver: n.driver || undefined, attachable: n.attachable })
      ]))
    }
    if (model.volumes.length) {
      doc.volumes = Object.fromEntries(model.volumes.filter((v) => v.key).map((v) => [v.key,
        v.external ? compact({ external: true, name: v.externalName || undefined }) : compact({ driver: v.driver || undefined })
      ]))
    }
    if (model.configs.length) {
      doc.configs = Object.fromEntries(model.configs.filter((c) => c.key).map((c) => [c.key,
        c.external ? compact({ external: true, name: c.externalName || undefined }) : {}
      ]))
    }
    if (model.secrets.length) {
      doc.secrets = Object.fromEntries(model.secrets.filter((s) => s.key).map((s) => [s.key,
        s.external ? compact({ external: true, name: s.externalName || undefined }) : {}
      ]))
    }

    return stringifyYaml(doc, { singleQuote: true })
  }

  function attachmentToYaml(a: AttachmentModel) {
    if (!a.target && !a.uid && !a.gid && !a.mode) return a.source
    return compact({ source: a.source, target: a.target || undefined, uid: a.uid || undefined, gid: a.gid || undefined, mode: a.mode ? Number(a.mode) : undefined })
  }

  function compact(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)))
  }

  return { emptyModel, newService, newNetwork, newVolume, newConfig, newSecret, parseComposeToModel, modelToYaml }
}
