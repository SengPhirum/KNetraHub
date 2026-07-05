import { listRegistries } from '~~/server/utils/store'

/** Service-level label that opts a service into the autoredeploy poller
 * (server/plugins/autoredeploy.ts). Not a Docker-native concept - this is
 * KNetraHub's own convention, same spirit as stack.ts's STACK_LABEL. */
export const AUTOREDEPLOY_LABEL = 'knetrahub.autoredeploy'

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

/** Base origin (scheme://host[:port]) of a stored Registry url, which is what
 * the Registry v2 API hangs off of (`<origin>/v2/...`). The stored url may carry
 * a path (e.g. Docker Hub's "https://index.docker.io/v1/") - we only want the
 * origin. Falls back to a trailing-slash-trimmed string if it isn't a valid URL. */
export function registryBaseFromUrl(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).origin
  } catch {
    return url.replace(/\/+$/, '')
  }
}

/** Decode the stored base64("user:pass") credential into its parts (or null for
 * anonymous). Mirrors resolveRegistryAuth's decode, but for a credential we
 * already hold rather than one resolved by image-host matching. */
export function decodeRegistryAuth(authB64?: string | null): { username: string; password: string } | null {
  if (!authB64) return null
  const decoded = Buffer.from(authB64, 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep === -1) return null
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
}

export interface RegistryV2Response<T = any> {
  status: number
  data: T | null
  headers: Headers | null
  error?: string
}

/**
 * Generic authenticated GET against a registry's v2 API, transparently handling
 * the token-auth challenge (Bearer or Basic) the same way fetchRemoteDigest does
 * - but for arbitrary endpoints (_catalog, tags/list, manifests, blobs). The
 * 401 challenge already carries the correct scope, so this works for catalog and
 * per-repository calls alike. Never throws: a network error/timeout returns
 * { status: 0 }. `path` is relative to `<base>/v2/`.
 */
export async function registryV2Get<T = any>(
  base: string,
  path: string,
  auth: { username: string; password: string } | null,
  opts: { accept?: string; timeoutMs?: number; responseType?: 'json' | 'text' } = {}
): Promise<RegistryV2Response<T>> {
  const timeoutMs = opts.timeoutMs ?? 10000
  const url = `${base}/v2/${path.replace(/^\/+/, '')}`
  const doGet = (headers: Record<string, string>) =>
    $fetch.raw(url, {
      method: 'GET',
      headers: { ...(opts.accept ? { Accept: opts.accept } : {}), ...headers },
      ignoreResponseError: true,
      timeout: timeoutMs,
      // Config blobs are frequently served as application/octet-stream, which
      // ofetch would otherwise read as a Blob (losing the JSON). Callers reading
      // a blob pass 'text' and parse it with parseJsonBlob().
      responseType: opts.responseType
    })
  try {
    let res = await doGet({})
    if (res.status === 401) {
      const challenge = res.headers.get('www-authenticate')
      const parsed = challenge ? parseWwwAuthenticate(challenge) : null
      if (parsed?.scheme === 'Basic') {
        res = await doGet(basicHeader(auth))
      } else if (parsed) {
        const token = await fetchBearerToken(parsed.params, auth, timeoutMs)
        if (token) res = await doGet({ Authorization: `Bearer ${token}` })
      }
    }
    const ok = res.status >= 200 && res.status < 300
    return { status: res.status, data: ok ? ((res as any)._data as T) : null, headers: res.headers }
  } catch (e: any) {
    return { status: 0, data: null, headers: null, error: e?.message || 'request failed' }
  }
}

/** Parse an image config blob into an object, regardless of how the registry
 * served it: ofetch may hand back an already-parsed object (json content-type),
 * a raw JSON string (octet-stream + responseType:'text'), or a Blob/Buffer. */
async function parseJsonBlob(data: unknown): Promise<any | null> {
  if (!data) return null
  if (typeof data === 'object' && !(data instanceof Blob) && !Buffer.isBuffer(data)) return data
  try {
    let text: string
    if (typeof data === 'string') text = data
    else if (typeof Blob !== 'undefined' && data instanceof Blob) text = await data.text()
    else if (Buffer.isBuffer(data)) text = data.toString('utf8')
    else text = String(data)
    return JSON.parse(text)
  } catch {
    return null
  }
}

export interface ManifestDetails {
  digest: string | null
  mediaType: string | null
  totalSize: number | null
  layers: number | null
  created: string | null
  architecture: string | null
  os: string | null
  /** Present for multi-arch manifest lists / OCI indexes. */
  platforms?: { os?: string; architecture?: string; variant?: string }[]
}

/** Fetch and normalize a tag's manifest for the registry browser's details view.
 * Resolves the config blob (when present) for created/arch/os, and sums layer
 * sizes. Returns null if the manifest can't be read. */
export async function fetchManifestDetails(
  base: string,
  repository: string,
  tag: string,
  auth: { username: string; password: string } | null,
  opts: { timeoutMs?: number } = {}
): Promise<ManifestDetails | null> {
  const timeoutMs = opts.timeoutMs ?? 10000
  const { status, data, headers } = await registryV2Get<any>(base, `${repository}/manifests/${tag}`, auth, {
    accept: MANIFEST_ACCEPT,
    timeoutMs
  })
  if (status !== 200 || !data) return null

  const digest = headers?.get('docker-content-digest') || null
  const mediaType = data.mediaType || null

  // Multi-arch manifest list / OCI index: no single config, list the platforms.
  if (Array.isArray(data.manifests)) {
    const platforms = data.manifests
      .map((m: any) => ({ os: m.platform?.os, architecture: m.platform?.architecture, variant: m.platform?.variant }))
      .filter((p: any) => p.os || p.architecture)
    return { digest, mediaType, totalSize: null, layers: null, created: null, architecture: null, os: null, platforms }
  }

  // schema2 / OCI single manifest.
  const layerList = Array.isArray(data.layers) ? data.layers : []
  const layerSize = layerList.reduce((s: number, l: any) => s + (l.size || 0), 0)
  const configSize = data.config?.size || 0

  let created: string | null = null
  let architecture: string | null = null
  let os: string | null = null
  const configDigest = data.config?.digest
  if (configDigest) {
    const cfg = await registryV2Get<any>(base, `${repository}/blobs/${configDigest}`, auth, { timeoutMs, responseType: 'text' })
    const parsed = cfg.status === 200 ? await parseJsonBlob(cfg.data) : null
    if (parsed) {
      created = parsed.created || null
      architecture = parsed.architecture || null
      os = parsed.os || null
    }
  }
  return { digest, mediaType, totalSize: layerSize + configSize, layers: layerList.length, created, architecture, os }
}

export interface ImageHistoryEntry {
  created: string | null
  createdBy: string | null
  comment: string | null
  emptyLayer: boolean
  size: number | null
  digest: string | null
}

export interface ImageHistory {
  digest: string | null
  os: string | null
  architecture: string | null
  created: string | null
  config: { user?: string; cmd?: string[]; entrypoint?: string[]; env?: string[]; workingDir?: string } | null
  totalSize: number | null
  history: ImageHistoryEntry[]
}

/** Read a tag's full image config (the v1 config blob) plus its layer table, and
 * correlate manifest layer sizes/digests onto the non-empty history entries -
 * exactly what the registry browser's "History" view (docker-registry-ui style)
 * renders. Resolves a multi-arch manifest list to a concrete platform first
 * (prefers linux/amd64). Returns null if the manifest can't be read. */
export async function fetchImageHistory(
  base: string,
  repository: string,
  tag: string,
  auth: { username: string; password: string } | null,
  opts: { timeoutMs?: number } = {}
): Promise<ImageHistory | null> {
  const timeoutMs = opts.timeoutMs ?? 12000
  const top = await registryV2Get<any>(base, `${repository}/manifests/${tag}`, auth, { accept: MANIFEST_ACCEPT, timeoutMs })
  if (top.status !== 200 || !top.data) return null

  let manifest = top.data
  let digest = top.headers?.get('docker-content-digest') || null

  // Multi-arch index: descend into a concrete platform manifest.
  if (Array.isArray(manifest.manifests)) {
    const list = manifest.manifests as any[]
    const pick =
      list.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64') ||
      list.find((m) => m.platform?.os === 'linux') ||
      list[0]
    if (!pick?.digest) return { digest, os: null, architecture: null, created: null, config: null, totalSize: null, history: [] }
    const sub = await registryV2Get<any>(base, `${repository}/manifests/${pick.digest}`, auth, { accept: MANIFEST_ACCEPT, timeoutMs })
    if (sub.status !== 200 || !sub.data) return { digest, os: null, architecture: null, created: null, config: null, totalSize: null, history: [] }
    manifest = sub.data
    digest = sub.headers?.get('docker-content-digest') || pick.digest
  }

  const layers: any[] = Array.isArray(manifest.layers) ? manifest.layers : []
  const configDigest = manifest.config?.digest
  let cfg: any = null
  if (configDigest) {
    const r = await registryV2Get<any>(base, `${repository}/blobs/${configDigest}`, auth, { timeoutMs, responseType: 'text' })
    if (r.status === 200) cfg = await parseJsonBlob(r.data)
  }

  const rawHistory: any[] = Array.isArray(cfg?.history) ? cfg.history : []
  let li = 0
  const history: ImageHistoryEntry[] = rawHistory.map((h) => {
    const emptyLayer = !!h.empty_layer
    let size: number | null = null
    let layerDigest: string | null = null
    if (!emptyLayer && li < layers.length) {
      size = layers[li].size ?? null
      layerDigest = layers[li].digest ?? null
      li++
    }
    return { created: h.created ?? null, createdBy: h.created_by ?? null, comment: h.comment ?? null, emptyLayer, size, digest: layerDigest }
  })

  const c = cfg?.config || {}
  const totalSize = layers.reduce((s, l) => s + (l.size || 0), 0) + (manifest.config?.size || 0)
  return {
    digest,
    os: cfg?.os ?? null,
    architecture: cfg?.architecture ?? null,
    created: cfg?.created ?? null,
    config: {
      user: c.User || undefined,
      cmd: c.Cmd || undefined,
      entrypoint: c.Entrypoint || undefined,
      env: c.Env || undefined,
      workingDir: c.WorkingDir || undefined
    },
    totalSize: layers.length ? totalSize : null,
    history
  }
}

export interface RegistryVerifyResult {
  ok: boolean
  status: number
  authenticated: boolean
  latencyMs: number
  message: string
}

/** Probe a registry's /v2/ endpoint to confirm it's reachable and the stored
 * credentials work. 200 = good; 401 after the auth attempt = bad credentials;
 * 0 = unreachable. Used by the per-registry "Verify" action. */
export async function verifyRegistry(
  base: string,
  auth: { username: string; password: string } | null,
  opts: { timeoutMs?: number } = {}
): Promise<RegistryVerifyResult> {
  const started = Date.now()
  const { status, error } = await registryV2Get(base, '', auth, { timeoutMs: opts.timeoutMs ?? 8000 })
  const latencyMs = Date.now() - started
  if (status >= 200 && status < 300) {
    return { ok: true, status, authenticated: !!auth, latencyMs, message: auth ? 'Connected and authenticated' : 'Connected (anonymous)' }
  }
  if (status === 401) {
    return { ok: false, status, authenticated: false, latencyMs, message: auth ? 'Authentication failed — check username/token' : 'Registry requires authentication' }
  }
  if (status === 404) {
    return { ok: false, status, authenticated: false, latencyMs, message: 'No Docker Registry v2 API at this URL' }
  }
  if (status === 0) {
    return { ok: false, status, authenticated: false, latencyMs, message: `Unreachable${error ? `: ${error}` : ''}` }
  }
  return { ok: false, status, authenticated: false, latencyMs, message: `Unexpected response (HTTP ${status})` }
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
