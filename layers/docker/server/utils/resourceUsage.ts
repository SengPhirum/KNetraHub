import { useDocker } from './docker'

/**
 * "What is still using this resource?" lookups, used by the delete endpoints
 * to refuse removing a network/volume/secret/config that is in active use -
 * with an error message that names the exact services/containers holding it,
 * instead of surfacing Docker's opaque "resource is in use" failure.
 */
export interface ResourceUser {
  type: 'service' | 'container'
  name: string
}

/** `service "traefik", container "web.1" and 3 more` - for toasts + system log. */
export function formatResourceUsers(users: ResourceUser[], max = 8): string {
  const shown = users.slice(0, max).map((u) => `${u.type} "${u.name}"`)
  const extra = users.length - shown.length
  return shown.join(', ') + (extra > 0 ? ` and ${extra} more` : '')
}

function dedupe(users: ResourceUser[]): ResourceUser[] {
  const seen = new Set<string>()
  return users.filter((u) => {
    const key = `${u.type}:${u.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Services attached to the network (spec or virtual IP) plus locally visible
 *  standalone containers. Swarm load-balancer endpoints ("lb-...") are the
 *  network's own bookkeeping, not users. */
export async function networkUsers(networkId: string): Promise<ResourceUser[]> {
  const docker = useDocker()
  const net: any = await docker.getNetwork(networkId).inspect().catch(() => null)
  if (!net) return []
  const users: ResourceUser[] = []

  const services: any[] = await docker.listServices().catch(() => [])
  for (const s of services) {
    const attached = (s.Spec?.TaskTemplate?.Networks || []).some((n: any) => n.Target === net.Id)
      || (s.Endpoint?.VirtualIPs || []).some((v: any) => v.NetworkID === net.Id)
    if (attached) users.push({ type: 'service', name: s.Spec?.Name || s.ID })
  }

  for (const c of Object.values<any>(net.Containers || {})) {
    const name = String(c?.Name || '')
    if (!name || name.startsWith('lb-')) continue
    // Task containers ("stack_svc.1.xyz") belong to a service already listed above.
    if (users.some((u) => u.type === 'service' && name.startsWith(`${u.name}.`))) continue
    users.push({ type: 'container', name })
  }
  return dedupe(users)
}

/** Services mounting the volume by name, plus containers on this node using
 *  it (the engine's volume filter only sees local containers). */
export async function volumeUsers(volumeName: string): Promise<ResourceUser[]> {
  const docker = useDocker()
  const users: ResourceUser[] = []

  const services: any[] = await docker.listServices().catch(() => [])
  for (const s of services) {
    const mounts: any[] = s.Spec?.TaskTemplate?.ContainerSpec?.Mounts || []
    if (mounts.some((m) => (m.Type || 'volume') === 'volume' && m.Source === volumeName)) {
      users.push({ type: 'service', name: s.Spec?.Name || s.ID })
    }
  }

  const containers: any[] = await docker
    .listContainers({ all: true, filters: JSON.stringify({ volume: [volumeName] }) })
    .catch(() => [])
  for (const c of containers) {
    const name = String(c.Names?.[0] || c.Id || '').replace(/^\//, '')
    if (!name) continue
    if (users.some((u) => u.type === 'service' && name.startsWith(`${u.name}.`))) continue
    users.push({ type: 'container', name })
  }
  return dedupe(users)
}

/** Services whose task template references the secret. */
export async function secretUsers(secretId: string): Promise<ResourceUser[]> {
  return attachmentUsers(secretId, 'Secrets', 'SecretID', 'SecretName', (d) => d.getSecret(secretId))
}

/** Services whose task template references the config. */
export async function configUsers(configId: string): Promise<ResourceUser[]> {
  return attachmentUsers(configId, 'Configs', 'ConfigID', 'ConfigName', (d) => d.getConfig(configId))
}

async function attachmentUsers(
  id: string,
  listKey: 'Secrets' | 'Configs',
  idKey: string,
  nameKey: string,
  get: (docker: ReturnType<typeof useDocker>) => { inspect(): Promise<any> }
): Promise<ResourceUser[]> {
  const docker = useDocker()
  const resource: any = await get(docker).inspect().catch(() => null)
  const resourceName = resource?.Spec?.Name

  const services: any[] = await docker.listServices().catch(() => [])
  const users: ResourceUser[] = []
  for (const s of services) {
    const refs: any[] = s.Spec?.TaskTemplate?.ContainerSpec?.[listKey] || []
    if (refs.some((r) => r[idKey] === id || (resourceName && r[nameKey] === resourceName))) {
      users.push({ type: 'service', name: s.Spec?.Name || s.ID })
    }
  }
  return dedupe(users)
}
