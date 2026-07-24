import { createHash, createHmac } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/**
 * Object-storage abstraction for PAM session recordings. Two backends:
 *   - `fs`  — a secured local/NFS directory (default, fully self-hosted).
 *   - `s3`  — any S3-compatible endpoint (MinIO/AWS), signed with SigV4 using
 *             only node:crypto (no SDK dependency).
 * The control plane is the ONLY holder of object-store credentials; the gateway
 * and browser never see them (recordings stream through the control plane).
 */

export interface StorageBackend {
  readonly name: string
  put(key: string, data: Buffer): Promise<{ size: number }>
  /** Full object, or a byte range [start,end] inclusive when `range` is given. */
  get(key: string, range?: { start: number; end: number }): Promise<Buffer>
  head(key: string): Promise<{ size: number } | null>
  delete(key: string): Promise<void>
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,255}$/
export function assertSafeKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`unsafe storage key: ${key}`)
  }
  return key
}

// ── filesystem backend ─────────────────────────────────────────────────────────

class FsBackend implements StorageBackend {
  readonly name = 'fs'
  constructor(private base: string) {}
  private path(key: string): string {
    const p = resolve(join(this.base, assertSafeKey(key)))
    if (p !== this.base && !p.startsWith(this.base + sep)) throw new Error('key escapes storage root')
    return p
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key)
    await fs.mkdir(p.slice(0, p.lastIndexOf(sep)), { recursive: true })
    await fs.writeFile(p, data, { mode: 0o600 })
    return { size: data.length }
  }
  async get(key: string, range?: { start: number; end: number }) {
    const p = this.path(key)
    if (!range) return fs.readFile(p)
    const fh = await fs.open(p, 'r')
    try {
      const len = range.end - range.start + 1
      const buf = Buffer.alloc(len)
      const { bytesRead } = await fh.read(buf, 0, len, range.start)
      return buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  }
  async head(key: string) {
    try { return { size: (await fs.stat(this.path(key))).size } } catch { return null }
  }
  async delete(key: string) {
    await fs.rm(this.path(key), { force: true })
  }
}

// ── S3 / MinIO backend (SigV4, no SDK) ─────────────────────────────────────────

interface S3Config { endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string; forcePathStyle: boolean }

function hmac(key: Buffer | string, data: string): Buffer { return createHmac('sha256', key).update(data, 'utf8').digest() }
function sha256hex(data: Buffer | string): string { return createHash('sha256').update(data).digest('hex') }

class S3Backend implements StorageBackend {
  readonly name = 's3'
  constructor(private cfg: S3Config) {}

  private url(key: string): string {
    const b = this.cfg.endpoint.replace(/\/$/, '')
    return this.cfg.forcePathStyle ? `${b}/${this.cfg.bucket}/${key}` : `${b.replace('://', `://${this.cfg.bucket}.`)}/${key}`
  }

  private async signedFetch(method: string, key: string, body: Buffer | null, extra: Record<string, string> = {}): Promise<Response> {
    assertSafeKey(key)
    const url = new URL(this.url(key))
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = body ? sha256hex(body) : sha256hex('')
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extra
    }
    const signedHeaders = Object.keys(headers).map((h) => h.toLowerCase()).sort().join(';')
    const canonicalHeaders = Object.keys(headers).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
      .map((h) => `${h.toLowerCase()}:${String(headers[h]).trim()}\n`).join('')
    const canonicalRequest = [method, url.pathname, url.search.replace(/^\?/, ''), canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const scope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
    const kDate = hmac('AWS4' + this.cfg.secretKey, dateStamp)
    const kRegion = hmac(kDate, this.cfg.region)
    const kService = hmac(kRegion, 's3')
    const kSigning = hmac(kService, 'aws4_request')
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    return fetch(url.toString(), { method, headers, body: body ?? undefined })
  }

  async put(key: string, data: Buffer) {
    const res = await this.signedFetch('PUT', key, data)
    if (!res.ok) throw new Error(`s3 put ${key} -> ${res.status} ${await res.text().catch(() => '')}`)
    return { size: data.length }
  }
  async get(key: string, range?: { start: number; end: number }) {
    const res = await this.signedFetch('GET', key, null, range ? { range: `bytes=${range.start}-${range.end}` } : {})
    if (!res.ok && res.status !== 206) throw new Error(`s3 get ${key} -> ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  async head(key: string) {
    const res = await this.signedFetch('HEAD', key, null)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`s3 head ${key} -> ${res.status}`)
    return { size: Number(res.headers.get('content-length') || 0) }
  }
  async delete(key: string) {
    const res = await this.signedFetch('DELETE', key, null)
    if (!res.ok && res.status !== 204 && res.status !== 404) throw new Error(`s3 delete ${key} -> ${res.status}`)
  }
}

// ── selection ───────────────────────────────────────────────────────────────────

function fileSecret(name: string): string {
  const f = process.env[`${name}_FILE`]
  if (f) { try { return readFileSync(f, 'utf8').trim() } catch { /* ignore */ } }
  return (process.env[name] || '').trim()
}

let _backend: StorageBackend | null = null
export function getStorage(): StorageBackend {
  if (_backend) return _backend
  const kind = (process.env.PAM_STORAGE_BACKEND || 'fs').toLowerCase()
  if (kind === 's3') {
    _backend = new S3Backend({
      endpoint: process.env.PAM_S3_ENDPOINT || 'http://minio:9000',
      bucket: process.env.PAM_S3_BUCKET || 'pam-recordings',
      region: process.env.PAM_S3_REGION || 'us-east-1',
      accessKey: fileSecret('PAM_S3_ACCESS_KEY'),
      secretKey: fileSecret('PAM_S3_SECRET_KEY'),
      forcePathStyle: process.env.PAM_S3_FORCE_PATH_STYLE !== 'false'
    })
  } else {
    _backend = new FsBackend(resolve(process.env.PAM_RECORDING_DIR || join(process.cwd(), '.pam-recordings')))
  }
  return _backend
}

/** Reset the memoized backend (tests). */
export function _resetStorage(): void { _backend = null }
