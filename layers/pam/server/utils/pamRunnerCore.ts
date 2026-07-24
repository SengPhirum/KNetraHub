import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * PAM connector-runner — pure, dependency-free core.
 *
 * These helpers implement the security-critical decisions of the runner control
 * plane (token hashing, connector-package verification, report application) with
 * NO database or Nuxt imports, so they are unit-testable in isolation and cannot
 * be accidentally coupled to request state. The DB-backed control-plane lives in
 * pamRunner.ts and delegates every trust decision to the functions here.
 */

// ── Runner identity tokens ────────────────────────────────────────────────────

export interface RunnerToken {
  /** The clear token — shown to the operator ONCE, never stored. */
  token: string
  /** SHA-256 hex of the token — the only thing persisted. */
  tokenHash: string
  /** Short non-sensitive prefix for display / lookup hints. */
  tokenPrefix: string
}

/** Mint a new high-entropy runner token. Only the hash is ever persisted. */
export function generateRunnerToken(): RunnerToken {
  const token = 'rnr_' + randomBytes(24).toString('base64url')
  return { token, tokenHash: hashRunnerToken(token), tokenPrefix: token.slice(0, 12) }
}

export function hashRunnerToken(token: string): string {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

/** Constant-time comparison of a presented token against a stored hash. */
export function runnerTokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashRunnerToken(token))
  const b = Buffer.from(String(storedHash || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Extract a bearer token from an Authorization header value. */
export function parseBearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || '').trim())
  return m ? m[1]!.trim() : null
}

// ── Connector-package signing / verification ──────────────────────────────────

export interface ConnectorRef {
  key: string
  version: string
  sha256: string
}

export interface ConnectorRegistryEntry {
  connector_key: string
  version: string
  sha256: string | null
  signature: string | null
  enabled: boolean
  trusted: boolean
  activation_status: string
  compatibility?: string | null
  kind?: string
}

function toKey(material: Buffer | string): Buffer {
  if (Buffer.isBuffer(material)) return material
  return createHash('sha256').update('knetrahub:pam:connector-sign:').update(String(material)).digest()
}

/** Detached signature over an immutable (key, version, digest) tuple. */
export function signConnector(ref: ConnectorRef, key: Buffer | string): string {
  return createHmac('sha256', toKey(key)).update(`${ref.key}\n${ref.version}\n${ref.sha256}`).digest('hex')
}

export function verifyConnectorSignature(ref: ConnectorRef, signature: string, key: Buffer | string): boolean {
  const expected = signConnector(ref, key)
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

const SAFE_REF = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * A connector key/version is only ever used to build a path inside the runner's
 * trusted directory. Reject anything that could escape it (path traversal,
 * separators, absolute paths). The web app NEVER supplies a filesystem path.
 */
export function isSafeConnectorRef(key: string, version: string): boolean {
  const k = String(key || '')
  const v = String(version || '')
  if (!SAFE_REF.test(k) || !SAFE_REF.test(v)) return false
  if (k.includes('..') || v.includes('..')) return false
  return true
}

export type ConnectorVerifyError =
  | 'unsafe_ref' | 'not_registered' | 'disabled' | 'untrusted' | 'not_active'
  | 'version_mismatch' | 'no_digest_on_record' | 'digest_mismatch' | 'unsigned' | 'bad_signature'

export interface ConnectorVerifyResult {
  ok: boolean
  errorCode?: ConnectorVerifyError
  detail: string
}

/**
 * The single gate that decides whether a runner may load & execute a connector
 * bundle. Rejects path traversal, unregistered/disabled/untrusted/inactive
 * connectors, version drift, digest mismatch, and unsigned or badly-signed
 * packages. `presented.sha256` is the digest the runner computed of its LOCAL
 * bundle; it must match the enabled registry entry AND the entry's signature.
 */
export function verifyConnectorPackage(
  presented: ConnectorRef,
  entry: ConnectorRegistryEntry | null | undefined,
  signingKey: Buffer | string
): ConnectorVerifyResult {
  if (!isSafeConnectorRef(presented.key, presented.version)) {
    return { ok: false, errorCode: 'unsafe_ref', detail: 'Connector key/version is not a safe reference' }
  }
  if (!entry) return { ok: false, errorCode: 'not_registered', detail: `Connector "${presented.key}" is not in the registry` }
  if (!entry.enabled) return { ok: false, errorCode: 'disabled', detail: `Connector "${presented.key}" is disabled` }
  if (!entry.trusted) return { ok: false, errorCode: 'untrusted', detail: `Connector "${presented.key}" is not trusted` }
  if (entry.activation_status !== 'active') {
    return { ok: false, errorCode: 'not_active', detail: `Connector "${presented.key}" version is not active (${entry.activation_status})` }
  }
  const compatible = presented.version === entry.version ||
    (entry.compatibility || '').split(',').map((s) => s.trim()).includes(presented.version)
  if (!compatible) {
    return { ok: false, errorCode: 'version_mismatch', detail: `Runner offered ${presented.key}@${presented.version}; registry expects ${entry.version}` }
  }
  if (!entry.sha256) return { ok: false, errorCode: 'no_digest_on_record', detail: 'Registry entry has no digest' }
  const dA = Buffer.from(presented.sha256 || '')
  const dB = Buffer.from(entry.sha256)
  if (dA.length !== dB.length || !timingSafeEqual(dA, dB)) {
    return { ok: false, errorCode: 'digest_mismatch', detail: 'Runner bundle digest does not match the registry' }
  }
  if (!entry.signature) return { ok: false, errorCode: 'unsigned', detail: 'Registry entry is unsigned' }
  // Sign over the REGISTRY digest (already digest-matched above).
  if (!verifyConnectorSignature({ key: entry.connector_key, version: entry.version, sha256: entry.sha256 }, entry.signature, signingKey)) {
    return { ok: false, errorCode: 'bad_signature', detail: 'Connector signature is invalid' }
  }
  return { ok: true, detail: 'verified' }
}

// ── Structured connector result & report application ──────────────────────────

export interface ConnectorRunResult {
  ok: boolean
  action?: string
  targetChanged?: boolean
  verified?: boolean
  retryable?: boolean
  errorCode?: string
  detail?: string
  evidence?: Record<string, unknown>
  changedObjects?: Array<Record<string, unknown>>
}

export interface ReportDecision {
  /** Whether a freshly-applied credential version should be sealed/activated. */
  seal: boolean
  /** Final success of the job as recorded. */
  ok: boolean
  /** Terminal failure (dead-letter) vs retry. */
  terminal: boolean
  detail: string
}

const CHANGE_ACTIONS = new Set(['rotate', 'change'])

/**
 * Pure decision for how to apply a runner's report. A change/rotate is only
 * sealed when the runner reports the target was actually changed AND
 * independently verified — never on a bare {ok:true}. A change that reports ok
 * without both flags is downgraded to a failure so the new version is NOT
 * activated over a target that did not actually accept it.
 */
export function applyReportDecision(job: { job_type: string }, result: ConnectorRunResult): ReportDecision {
  const isChange = CHANGE_ACTIONS.has(job.job_type)
  const detail = result.detail || (result.ok ? 'ok' : 'failed')
  if (isChange) {
    const sealEligible = result.ok === true && result.targetChanged === true && result.verified === true
    if (result.ok && !sealEligible) {
      return {
        seal: false,
        ok: false,
        terminal: result.retryable === false,
        detail: `Change reported ok but not confirmed (targetChanged=${!!result.targetChanged}, verified=${!!result.verified}); new credential NOT activated. ${detail}`
      }
    }
    return { seal: sealEligible, ok: !!result.ok, terminal: !result.ok && result.retryable === false, detail }
  }
  return { seal: false, ok: !!result.ok, terminal: !result.ok && result.retryable === false, detail }
}

/** Redact anything that looks like a secret from a runner log line. */
export function redactLog(text: string): string {
  return String(text).replace(/[A-Za-z0-9+/=_-]{32,}/g, '«redacted»')
}
