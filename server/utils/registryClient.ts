import { listRegistries } from './store'

/** Service-level label that opts a service into the autoredeploy poller
 * (server/plugins/autoredeploy.ts). Not a Docker-native concept - this is
 * DockHub's own convention, same spirit as stack.ts's STACK_LABEL. */
export const AUTOREDEPLOY_LABEL = 'dockhub.autoredeploy'

export interface ImageRef {
  registryHost: string
  repository: string
  tag: string
}

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json'
].join(', ')

/** Same registry/repository/tag heuristic as imageParts() in
 * server/api/services/[id].get.ts, but returns a real hostname usable for
 * HTTP calls (registry-1.docker.io) instead of a "Docker Hub" display label. */
export function parseImageRef(image: string): ImageRef {
  const bare = (image || '').split('@')[0] ?? ''
  const slashIndex = bare.lastIndexOf('/')
  const colonIndex = bare.lastIndexOf(':')
  const hasTag = colonIndex > slashIndex
  const repositoryPart = hasTag ? bare.slice(0, colonIndex) : bare
  const tag = (hasTag ? bare.slice(colonIndex + 1) : 'latest') || 'latest'
  const first = repositoryPart.split('/')[0] ?? ''
  const hasRegistry = first.includes('.') || first.includes(':') || first === 'localhost'

  if (!hasRegistry) {
    const repository = repositoryPart.includes('/') ? repositoryPart : `library/${repositoryPart}`
    return { registryHost: 'registry-1.docker.io', repository, tag }
  }
  return { registryHost: first, repository: repositoryPart.split('/').slice(1).join('/'), tag }
}

/** Pure helper: Swarm auto-pins repo:tag@sha256:digest into a running
 * service's spec after every deploy, so that pinned value read fresh each
 * tick already IS the "last seen digest" - nothing to persist separately. */
export function extractPinnedDigest(spec: any): string | null {
  const image = spec?.TaskTemplate?.ContainerSpec?.Image
  if (!image || !image.includes('@')) return null
  return image.split('@')[1] || null
}

/** Matches a registry host against stored Registry credentials by parsed
 * hostname (not exact string match against the stored url, since a record
 * might be saved as "https://ghcr.io" while the image ref's host is bare
 * "ghcr.io"). Returns null for anonymous/no-match - never throws, callers
 * treat null as "try anonymous", not as an error. */
export async function resolveRegistryAuth(registryHost: string): Promise<{ username: string; password: string } | null> {
  try {
    const registries = await listRegistries()
    const match = registries.find((r) => {
      try {
        return new URL(r.url).hostname === registryHost
      } catch {
        return r.url.includes(registryHost)
      }
    })
    if (!match?.auth) return null
    const decoded = Buffer.from(match.auth, 'base64').toString('utf8')
    const sep = decoded.indexOf(':')
    if (sep === -1) return null
    return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
  } catch {
    return null
  }
}

function basicHeader(auth: { username: string; password: string } | null): Record<string, string> {
  if (!auth) return {}
  return { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}` }
}

function parseWwwAuthenticate(header: string): { scheme: 'Bearer' | 'Basic'; params: Record<string, string> } | null {
  const match = header.match(/^(Bearer|Basic)\s+(.*)$/i)
  if (!match) return null
  const scheme: 'Bearer' | 'Basic' = /bearer/i.test(match[1] ?? '') ? 'Bearer' : 'Basic'
  const params: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  const rest = match[2] ?? ''
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    const key = m[1]
    const value = m[2]
    if (key && value !== undefined) params[key] = value
  }
  return { scheme, params }
}

async function fetchBearerToken(params: Record<string, string>, auth: { username: string; password: string } | null, timeoutMs: number): Promise<string | null> {
  if (!params.realm) return null
  try {
    const query = new URLSearchParams()
    if (params.service) query.set('service', params.service)
    if (params.scope) query.set('scope', params.scope)
    const res = await $fetch<any>(`${params.realm}?${query.toString()}`, {
      headers: basicHeader(auth),
      timeout: timeoutMs
    })
    return res?.token || res?.access_token || null
  } catch {
    return null
  }
}

/**
 * Implements the standard Docker Registry HTTP API v2 token-auth challenge
 * flow - uniform across Docker Hub, GHCR, Harbor, GitLab registry, etc.
 * Returns the registry's current Docker-Content-Digest for the tag, or null
 * if it could not be determined for any reason (network error, no matching
 * credentials on a private registry, unsupported challenge, timeout...).
 * Callers must treat null as "skip this tick", never as "digest changed".
 *
 * Note on manifest lists: a tag that points at a multi-arch manifest list
 * returns the *list's* digest here, which is also what Swarm re-resolves
 * against on a bare repo:tag redeploy - so list-vs-list comparison is
 * correct and self-consistent. Do not "fix" this into a per-platform digest
 * comparison.
 */
export async function fetchRemoteDigest(ref: ImageRef, opts: { timeoutMs?: number } = {}): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 10000
  const manifestUrl = `https://${ref.registryHost}/v2/${ref.repository}/manifests/${ref.tag}`

  async function head(headers: Record<string, string>) {
    return await $fetch.raw(manifestUrl, {
      method: 'HEAD',
      headers: { Accept: MANIFEST_ACCEPT, ...headers },
      ignoreResponseError: true,
      timeout: timeoutMs
    })
  }

  try {
    const first = await head({})
    if (first.status === 200) return first.headers.get('docker-content-digest') || null
    if (first.status !== 401) return null

    const challenge = first.headers.get('www-authenticate')
    const parsed = challenge ? parseWwwAuthenticate(challenge) : null
    if (!parsed) return null

    const auth = await resolveRegistryAuth(ref.registryHost)

    if (parsed.scheme === 'Basic') {
      const retried = await head(basicHeader(auth))
      return retried.status === 200 ? retried.headers.get('docker-content-digest') : null
    }

    const token = await fetchBearerToken(parsed.params, auth, timeoutMs)
    if (!token) return null
    const retried = await head({ Authorization: `Bearer ${token}` })
    return retried.status === 200 ? retried.headers.get('docker-content-digest') : null
  } catch {
    return null
  }
}
