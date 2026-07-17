import snmp from 'net-snmp'
import { convertVarbind, type SnmpValue } from './values'
import type { CollectionOutcome, SnmpVersion } from '../../shared/constants'

/**
 * Production SNMP engine: a thin, promise-based, outcome-aware wrapper over
 * net-snmp supporting v1/v2c/v3 (noAuthNoPriv/authNoPriv/authPriv; MD5/SHA-
 * family auth; DES/AES-family priv), GET, GETNEXT-based walks, GETBULK
 * tables, contexts, IPv4/IPv6, per-request timeout/retry, and secret-free
 * logging.
 *
 * Every operation resolves to an SnmpOpResult — never throws for protocol
 * failures — so callers can record a precise CollectionOutcome for the
 * no-silent-loss audit trail.
 */

export interface ResolvedSnmpConfig {
  host: string
  port: number
  transport: 'udp4' | 'udp6'
  version: SnmpVersion
  community?: string // v1/v2c (plaintext, already decrypted)
  context?: string
  v3?: {
    level: 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'
    username: string
    authProtocol?: 'md5' | 'sha' | 'sha224' | 'sha256' | 'sha384' | 'sha512'
    authPassword?: string
    privProtocol?: 'des' | 'aes' | 'aes256b' | 'aes256r'
    privPassword?: string
  }
  timeoutMs: number
  retries: number
  maxRepetitions?: number
}

export type SnmpOpResult<T> =
  | { ok: true; value: T; durationMs: number; truncated?: boolean; note?: string }
  | { ok: false; outcome: CollectionOutcome; error: string; durationMs: number }

export interface WalkRow {
  oid: string
  /** Index part after the base OID (may be compound / string-encoded). */
  index: string
  value: SnmpValue
}

const AUTH_PROTOCOLS: Record<string, any> = {
  md5: snmp.AuthProtocols.md5,
  sha: snmp.AuthProtocols.sha,
  sha224: snmp.AuthProtocols.sha224,
  sha256: snmp.AuthProtocols.sha256,
  sha384: snmp.AuthProtocols.sha384,
  sha512: snmp.AuthProtocols.sha512
}
const PRIV_PROTOCOLS: Record<string, any> = {
  des: snmp.PrivProtocols.des,
  aes: snmp.PrivProtocols.aes,
  aes256b: snmp.PrivProtocols.aes256b,
  aes256r: snmp.PrivProtocols.aes256r
}

/** Classify a net-snmp error into a CollectionOutcome (never leaks secrets). */
function classifyError(err: unknown): { outcome: CollectionOutcome; error: string } {
  const name = (err as any)?.name ?? ''
  const message = String((err as any)?.message ?? err ?? 'unknown error')
  if (name === 'RequestTimedOutError' || /timed?\s?out/i.test(message)) {
    return { outcome: 'timeout', error: 'SNMP request timed out' }
  }
  if (/auth|usmStats|unknown user|decryption|unsupported security/i.test(message)) {
    return { outcome: 'auth_failure', error: 'SNMP authentication/privacy failure' }
  }
  if (/NoSuchObject|NoSuchInstance|NoSuchName/i.test(name + message)) {
    return { outcome: 'unsupported', error: message }
  }
  return { outcome: 'failed', error: message }
}

export class SnmpClient {
  private session: any
  private readonly cfg: ResolvedSnmpConfig
  closed = false

  constructor(cfg: ResolvedSnmpConfig) {
    this.cfg = cfg
    const options: Record<string, any> = {
      port: cfg.port,
      transport: cfg.transport,
      timeout: cfg.timeoutMs,
      retries: cfg.retries,
      version: cfg.version === 'v1' ? snmp.Version1 : cfg.version === 'v2c' ? snmp.Version2c : snmp.Version3,
      context: cfg.context || ''
    }
    if (cfg.version === 'v3') {
      const v3 = cfg.v3
      if (!v3?.username) throw new Error('SNMPv3 requires a username')
      const user: Record<string, any> = {
        name: v3.username,
        level:
          v3.level === 'authPriv' ? snmp.SecurityLevel.authPriv
          : v3.level === 'authNoPriv' ? snmp.SecurityLevel.authNoPriv
          : snmp.SecurityLevel.noAuthNoPriv
      }
      if (v3.level !== 'noAuthNoPriv') {
        user.authProtocol = AUTH_PROTOCOLS[v3.authProtocol ?? 'sha']
        user.authKey = v3.authPassword ?? ''
      }
      if (v3.level === 'authPriv') {
        user.privProtocol = PRIV_PROTOCOLS[v3.privProtocol ?? 'aes']
        user.privKey = v3.privPassword ?? ''
      }
      this.session = snmp.createV3Session(cfg.host, user, options)
    } else {
      this.session = snmp.createSession(cfg.host, cfg.community ?? 'public', options)
    }
    // Prevent a socket error (ICMP port unreachable etc.) from crashing Nitro.
    this.session.on?.('error', () => {})
  }

  /** GET a set of scalar OIDs. Per-OID NoSuch* errors are reported per key. */
  get(oids: string[]): Promise<SnmpOpResult<Record<string, SnmpValue | null>>> {
    const started = Date.now()
    return new Promise((resolve) => {
      this.session.get(oids, (err: unknown, varbinds: any[]) => {
        if (err) {
          const { outcome, error } = classifyError(err)
          return resolve({ ok: false, outcome, error, durationMs: Date.now() - started })
        }
        const out: Record<string, SnmpValue | null> = {}
        for (let i = 0; i < oids.length; i++) {
          const vb = varbinds[i]
          out[oids[i]] = vb && !snmp.isVarbindError(vb) ? convertVarbind(vb) : null
        }
        resolve({ ok: true, value: out, durationMs: Date.now() - started })
      })
    })
  }

  /** GET a single scalar. */
  async getOne(oid: string): Promise<SnmpOpResult<SnmpValue | null>> {
    const res = await this.get([oid])
    if (!res.ok) return res
    return { ok: true, value: res.value[oid] ?? null, durationMs: res.durationMs }
  }

  /**
   * Walk a subtree (GETBULK on v2c/v3, GETNEXT on v1). Returns every row with
   * its index relative to the base OID. An empty result is ok:true with [] —
   * callers decide whether empty means "unsupported" or "no instances".
   *
   * `partial: true` (diagnostic capture mode) returns whatever rows were
   * collected when the walk hits maxRows or fails mid-walk — as ok:true with
   * `truncated`/`note` set — instead of discarding them. Collection code must
   * NOT use it: reconciliation needs the complete-or-failed contract.
   */
  walk(baseOid: string, opts?: { hint?: 'mac' | 'hex' | 'text'; maxRows?: number; partial?: boolean }): Promise<SnmpOpResult<WalkRow[]>> {
    const started = Date.now()
    const rows: WalkRow[] = []
    const maxRows = opts?.maxRows ?? 50000
    const prefix = baseOid.replace(/^\./, '') + '.'
    let truncated = false
    return new Promise((resolve) => {
      const feed = (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) continue
          const oid = String(vb.oid)
          if (!oid.startsWith(prefix)) continue
          rows.push({ oid, index: oid.slice(prefix.length), value: convertVarbind(vb, opts?.hint) })
          if (rows.length >= maxRows) {
            truncated = true
            return true // stop the walk
          }
        }
        return false
      }
      const done = (err: unknown) => {
        if (err) {
          const { outcome, error } = classifyError(err)
          if (opts?.partial && rows.length) {
            return resolve({ ok: true, value: rows, durationMs: Date.now() - started, truncated: true, note: `walk failed after ${rows.length} rows: ${error}` })
          }
          // A walk that already returned rows then failed is a truncated
          // table — surface as failure so reconciliation won't treat the
          // partial data as the complete truth.
          return resolve({ ok: false, outcome, error: rows.length ? `truncated after ${rows.length} rows: ${error}` : error, durationMs: Date.now() - started })
        }
        if (truncated) {
          if (opts?.partial) {
            return resolve({ ok: true, value: rows, durationMs: Date.now() - started, truncated: true, note: `stopped at maxRows=${maxRows}` })
          }
          return resolve({ ok: false, outcome: 'failed', error: `walk exceeded maxRows=${maxRows}`, durationMs: Date.now() - started })
        }
        resolve({ ok: true, value: rows, durationMs: Date.now() - started })
      }
      this.session.subtree(baseOid, this.cfg.maxRepetitions ?? 20, feed, done)
    })
  }

  /**
   * Walk a conceptual table of column OIDs and pivot to index → column map.
   * Sparse tables are preserved (missing cells are simply absent). Column
   * walks run sequentially to stay gentle on small devices.
   */
  async table(
    columns: Record<string, string>,
    opts?: { hints?: Record<string, 'mac' | 'hex' | 'text'> }
  ): Promise<SnmpOpResult<Map<string, Record<string, SnmpValue>>>> {
    const started = Date.now()
    const byIndex = new Map<string, Record<string, SnmpValue>>()
    let anyOk = false
    const errors: string[] = []
    for (const [name, oid] of Object.entries(columns)) {
      const res = await this.walk(oid, { hint: opts?.hints?.[name] })
      if (!res.ok) {
        // A single unsupported column is fine (sparse/optional columns);
        // a timeout/auth failure invalidates the whole table read.
        if (res.outcome === 'timeout' || res.outcome === 'auth_failure') {
          return { ok: false, outcome: res.outcome, error: `column ${name}: ${res.error}`, durationMs: Date.now() - started }
        }
        errors.push(`${name}: ${res.error}`)
        continue
      }
      anyOk = true
      for (const row of res.value) {
        let entry = byIndex.get(row.index)
        if (!entry) {
          entry = {}
          byIndex.set(row.index, entry)
        }
        entry[name] = row.value
      }
    }
    if (!anyOk) {
      return { ok: false, outcome: 'unsupported', error: errors.join('; ') || 'no columns returned data', durationMs: Date.now() - started }
    }
    return { ok: true, value: byIndex, durationMs: Date.now() - started }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.session.close()
    } catch {
      /* already closed */
    }
  }
}

/** Redacted connection descriptor for logs/debug output. */
export function describeSnmpTarget(cfg: ResolvedSnmpConfig): string {
  const auth = cfg.version === 'v3' ? `v3/${cfg.v3?.level}/user=${cfg.v3?.username ?? '?'}` : cfg.version
  return `${cfg.host}:${cfg.port} (${auth}${cfg.context ? `, ctx=${cfg.context}` : ''})`
}
