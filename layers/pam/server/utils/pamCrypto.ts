import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * KNetraHub PAM cryptographic vault — envelope encryption.
 *
 * Every credential/secret VERSION gets its own random 256-bit data-encryption
 * key (DEK). The value is sealed with AES-256-GCM under the DEK; the DEK is
 * then wrapped with the master key (KEK). Only ciphertext is ever persisted:
 * the value ciphertext, the wrapped DEK, the KEK version, and the algorithm.
 *
 * Design decisions enforced here (spec §6):
 *  - The KEK is loaded from NUXT_PAM_MASTER_KEY (or its _FILE sibling, resolved
 *    by docker-entrypoint.sh). It is NEVER derived from NUXT_JWT_SECRET.
 *  - Master-key versioning + online rotation: provide a JSON keyring and old
 *    DEKs are rewrapped under the new KEK without ever touching the value
 *    plaintext (rewrap()).
 *  - Fail closed: in production a missing/invalid key throws on every
 *    operation. GCM authentication-tag failure throws (tamper detection).
 *  - No plaintext, no key, and no reversible checksum is written to disk or
 *    logs; nothing here returns key material.
 *
 * Reads process.env directly (not useRuntimeConfig) so it is identically usable
 * from Nitro handlers, background workers, and vitest unit tests.
 */

const KEK_DOMAIN = 'knetrahub:pam:kek:v1'
const DEK_BYTES = 32
const GCM = 'aes-256-gcm'

export interface SealedValue {
  algo: string
  keyVersion: number
  wrappedDek: string
  valueCiphertext: string
}

interface Keyring {
  activeVersion: number
  keys: Map<number, Buffer>
}

let _keyring: Keyring | null = null
let _devWarned = false

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Normalize any provided key material into a deterministic 32-byte KEK. */
function materialToKey(material: string): Buffer {
  return createHash('sha256').update(`${KEK_DOMAIN}:${material}`).digest()
}

/**
 * Load the master-key keyring once. Accepts either:
 *  - a plain string  → single KEK at version 1, or
 *  - JSON {"active": N, "keys": {"1": "...", "2": "..."}} → multi-version.
 * In production a missing key is fatal (fail closed). In dev/test a stable
 * ephemeral key is derived with a loud one-time warning so the module is
 * usable locally without provisioning a secret.
 */
export function loadKeyring(): Keyring {
  if (_keyring) return _keyring
  const raw = (process.env.NUXT_PAM_MASTER_KEY || '').trim()

  if (!raw) {
    if (isProduction()) {
      throw new Error('[pam:crypto] NUXT_PAM_MASTER_KEY is not set — the vault is unavailable and fails closed')
    }
    if (!_devWarned) {
      console.warn('[pam:crypto] NUXT_PAM_MASTER_KEY not set — using a NON-PRODUCTION ephemeral dev key. Set a real master key (Docker secret) before deploying.')
      _devWarned = true
    }
    _keyring = { activeVersion: 1, keys: new Map([[1, materialToKey('knetrahub-pam-development-only')]]) }
    return _keyring
  }

  let parsed: { active?: number; keys?: Record<string, string> } | null = null
  if (raw.startsWith('{')) {
    try { parsed = JSON.parse(raw) } catch { parsed = null }
  }

  if (parsed && parsed.keys && Object.keys(parsed.keys).length) {
    const keys = new Map<number, Buffer>()
    for (const [v, mat] of Object.entries(parsed.keys)) {
      const version = Number(v)
      if (!Number.isInteger(version) || version < 1 || !mat) continue
      keys.set(version, materialToKey(String(mat)))
    }
    if (!keys.size) throw new Error('[pam:crypto] NUXT_PAM_MASTER_KEY keyring has no usable keys')
    const active = Number(parsed.active) || Math.max(...keys.keys())
    if (!keys.has(active)) throw new Error(`[pam:crypto] active key version ${active} is not present in the keyring`)
    _keyring = { activeVersion: active, keys }
    return _keyring
  }

  _keyring = { activeVersion: 1, keys: new Map([[1, materialToKey(raw)]]) }
  return _keyring
}

/** Reset the memoized keyring (used by tests and after a live rotation reload). */
export function _resetKeyring(): void {
  _keyring = null
}

export function activeKeyVersion(): number {
  return loadKeyring().activeVersion
}

function kekFor(version: number): Buffer {
  const kr = loadKeyring()
  const key = kr.keys.get(version)
  if (!key) throw new Error(`[pam:crypto] master key version ${version} unavailable — refusing to operate (fail closed)`)
  return key
}

/** iv:tag:data (all base64) — one GCM blob. */
function gcmSeal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(GCM, key, iv)
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`
}

function gcmOpen(key: Buffer, blob: string): Buffer {
  const [ivB64, tagB64, dataB64] = blob.split(':')
  const iv = Buffer.from(ivB64 ?? '', 'base64')
  const tag = Buffer.from(tagB64 ?? '', 'base64')
  const data = Buffer.from(dataB64 ?? '', 'base64')
  const decipher = createDecipheriv(GCM, key, iv)
  decipher.setAuthTag(tag) // GCM: final() throws on tag mismatch → tamper detection
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** Envelope-encrypt a value. Generates a fresh DEK; wraps it under the active KEK. */
export function seal(plaintext: string): SealedValue {
  const keyVersion = activeKeyVersion()
  const dek = randomBytes(DEK_BYTES)
  const valueCiphertext = gcmSeal(dek, Buffer.from(plaintext, 'utf8'))
  const wrappedDek = gcmSeal(kekFor(keyVersion), dek)
  dek.fill(0) // limit plaintext DEK lifetime in memory
  return { algo: GCM, keyVersion, wrappedDek, valueCiphertext }
}

/** Envelope-decrypt. Throws on missing key or authentication failure (fail closed). */
export function open(sealed: Pick<SealedValue, 'keyVersion' | 'wrappedDek' | 'valueCiphertext'>): string {
  const dek = gcmOpen(kekFor(sealed.keyVersion), sealed.wrappedDek)
  try {
    return gcmOpen(dek, sealed.valueCiphertext).toString('utf8')
  } finally {
    dek.fill(0)
  }
}

/**
 * Rewrap a sealed value's DEK under a new KEK version WITHOUT decrypting the
 * value. The value ciphertext is unchanged; only wrappedDek/keyVersion change.
 * This is the online master-key rotation primitive.
 */
export function rewrap(sealed: SealedValue, toVersion = activeKeyVersion()): SealedValue {
  const dek = gcmOpen(kekFor(sealed.keyVersion), sealed.wrappedDek)
  try {
    const wrappedDek = gcmSeal(kekFor(toVersion), dek)
    return { algo: sealed.algo, keyVersion: toVersion, wrappedDek, valueCiphertext: sealed.valueCiphertext }
  } finally {
    dek.fill(0)
  }
}

/** Non-reversible fingerprint of a KEK version, for the pam.crypto_keys registry. */
export function keyFingerprint(version = activeKeyVersion()): string {
  return createHash('sha256').update('knetrahub:pam:kek-fp:').update(kekFor(version)).digest('hex').slice(0, 32)
}

// ── Recording / object integrity ─────────────────────────────────────────────

function recordingKey(): Buffer {
  const raw = (process.env.NUXT_PAM_RECORDING_SIGNING_KEY || '').trim()
  if (raw) return createHash('sha256').update('knetrahub:pam:rec:').update(raw).digest()
  // Fall back to the master key so integrity signing always has a key; a
  // dedicated signing key is recommended and documented.
  return kekFor(activeKeyVersion())
}

/** Keyed integrity value (HMAC-SHA256) for a recording/object payload. */
export function integritySignature(payload: Buffer | string): string {
  return createHmac('sha256', recordingKey())
    .update(typeof payload === 'string' ? Buffer.from(payload) : payload)
    .digest('hex')
}

export function checksum(payload: Buffer | string): string {
  return createHash('sha256').update(typeof payload === 'string' ? Buffer.from(payload) : payload).digest('hex')
}

/** Constant-time verification of an integrity signature. */
export function verifyIntegrity(payload: Buffer | string, signature: string): boolean {
  const expected = integritySignature(payload)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Redact anything that looks like a sealed blob / secret from a log string. */
export function redact(text: string): string {
  return String(text).replace(/[A-Za-z0-9+/=]{40,}/g, '«redacted»')
}
