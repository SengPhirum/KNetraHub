/**
 * Minimal TypeScript SDK for the KNetraHub PAM secrets API.
 *
 * Usage:
 *   import { KnetraPamClient } from './sdk-typescript'
 *   const pam = new KnetraPamClient({ baseUrl: process.env.KNETRA_PAM_URL!, token: process.env.KNETRA_PAM_TOKEN! })
 *   const { value } = await pam.getSecret('app/prod/db')
 *
 * The token is an application-identity api_token. Values are returned once per
 * call, may be leased (server-side), and are never cached by this client.
 */
export interface KnetraPamOptions {
  baseUrl: string
  token: string
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface SecretResult {
  path: string
  version: number
  value: string
  leaseTtlSeconds: number
  oneTime: boolean
}

export class KnetraPamClient {
  private baseUrl: string
  private token: string
  private timeoutMs: number
  private fetchImpl: typeof fetch

  constructor(opts: KnetraPamOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.token = opts.token
    this.timeoutMs = opts.timeoutMs ?? 8000
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async getSecret(path: string, version?: number): Promise<SecretResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/pam/v1/secrets/retrieve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path, version }),
      signal: AbortSignal.timeout(this.timeoutMs)
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`PAM secret retrieval failed (HTTP ${res.status}): ${detail.slice(0, 200)}`)
    }
    return res.json() as Promise<SecretResult>
  }

  /** Convenience for JSON secrets: returns the parsed object. */
  async getJson<T = Record<string, unknown>>(path: string, version?: number): Promise<T> {
    const { value } = await this.getSecret(path, version)
    return JSON.parse(value) as T
  }
}
