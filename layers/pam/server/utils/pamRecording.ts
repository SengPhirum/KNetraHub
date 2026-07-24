import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { seal, open, checksum, integritySignature, verifyIntegrity, activeKeyVersion, type SealedValue } from './pamCrypto'
import { getStorage } from './pamStorage'
import { newId, nowIso } from './pamStore'
import { recordRisk } from './pamRisk'

/**
 * Session-recording pipeline (spec §3.5). Recording bytes are:
 *   1. encrypted with a per-recording AES-256-GCM data key,
 *   2. the data key wrapped under the master key (envelope, version-aware),
 *   3. the ciphertext object stored in object storage (fs/S3),
 *   4. a checksum of the STORED object + immutable metadata signed with the
 *      recording key,
 *   5. INDEPENDENTLY re-read from storage, re-hashed, and signature-verified —
 *      integrity is marked valid ONLY after that independent verification,
 *      never from a gateway-supplied checksum.
 */

const GCM = 'aes-256-gcm'

interface EncMeta { algo: string; iv: string; wrappedDek: SealedValue }

function encrypt(plaintext: Buffer): { blob: Buffer; meta: EncMeta; keyVersion: number } {
  const dek = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv(GCM, dek, iv)
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const wrappedDek = seal(dek.toString('base64')) // envelope: DEK sealed under the master key (carries keyVersion)
  dek.fill(0)
  return { blob: Buffer.concat([tag, data]), meta: { algo: GCM, iv: iv.toString('base64'), wrappedDek }, keyVersion: wrappedDek.keyVersion }
}

function decrypt(blob: Buffer, meta: EncMeta): Buffer {
  const dek = Buffer.from(open(meta.wrappedDek), 'base64')
  try {
    const iv = Buffer.from(meta.iv, 'base64')
    const tag = blob.subarray(0, 16)
    const data = blob.subarray(16)
    const decipher = createDecipheriv(GCM, dek, iv)
    decipher.setAuthTag(tag) // GCM final() throws on tamper
    return Buffer.concat([decipher.update(data), decipher.final()])
  } finally {
    dek.fill(0)
  }
}

function signedPayload(sessionId: string, storageKey: string, size: number, digest: string): string {
  return `${sessionId}|${storageKey}|${size}|${digest}`
}

export interface StoreRecordingInput {
  sessionId: string
  data: Buffer
  format?: string
  durationMs?: number
  retentionUntil?: string | null
}

/** Encrypt, store, and independently verify a recording. Returns the row id and
 * whether integrity verification passed (recording_status reflects it). */
export async function storeRecording(input: StoreRecordingInput, db: Pool = getPamDb()): Promise<{ id: string; integrityOk: boolean; storageKey: string; checksum: string; size: number }> {
  const storage = getStorage()
  const recId = newId()
  const { blob, meta, keyVersion } = encrypt(input.data)
  const storageKey = `recordings/${input.sessionId}/${recId}.enc`

  await storage.put(storageKey, blob)

  const digest = checksum(blob)
  const payload = signedPayload(input.sessionId, storageKey, blob.length, digest)
  const signature = integritySignature(payload)

  // Independent verification: read the object back from storage, recompute the
  // digest, and verify the signature. Do NOT trust the in-memory blob here.
  let integrityOk = false
  let integrityDetail = ''
  try {
    const reread = await storage.get(storageKey)
    const rereadDigest = checksum(reread)
    const digestMatch = rereadDigest === digest
    const sigOk = verifyIntegrity(payload, signature)
    integrityOk = digestMatch && sigOk
    integrityDetail = integrityOk ? 'verified: stored object re-read, digest + signature match'
      : `verification failed: digestMatch=${digestMatch} sigOk=${sigOk}`
  } catch (e: any) {
    integrityDetail = `re-read failed: ${String(e?.message || e)}`
  }

  const now = nowIso()
  await db.query(
    `INSERT INTO pam.session_recordings
      (id, session_id, format, storage_backend, storage_key, size_bytes, duration_ms, encrypted, key_version,
       checksum, signature, signing_key_version, integrity_ok, integrity_checked_at, integrity_detail, enc_meta, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [recId, input.sessionId, input.format || 'asciicast', storage.name, storageKey, blob.length,
      input.durationMs ? Number(input.durationMs) : null, keyVersion, digest, signature, activeKeyVersion(),
      integrityOk, now, integrityDetail, JSON.stringify(meta), now]
  )
  await db.query("UPDATE pam.sessions SET recording_status=$2 WHERE id=$1", [input.sessionId, integrityOk ? 'stored' : 'failed'])
  if (!integrityOk) {
    await recordRisk({ ruleKey: 'recording_integrity_failure', sessionId: input.sessionId, explanation: `Recording ${recId} failed independent integrity verification: ${integrityDetail}` }, db).catch(() => {})
  }
  return { id: recId, integrityOk, storageKey, checksum: digest, size: blob.length }
}

/** Decrypt and return a recording's plaintext bytes (+ metadata). */
export async function openRecording(recordingId: string, db: Pool = getPamDb()): Promise<{ data: Buffer; format: string; sessionId: string; durationMs: number | null } | null> {
  const { rows } = await db.query('SELECT * FROM pam.session_recordings WHERE id=$1', [recordingId])
  const r = rows[0]
  if (!r || !r.storage_key || !r.enc_meta) return null
  const blob = await getStorage().get(r.storage_key)
  const data = decrypt(blob, JSON.parse(r.enc_meta))
  return { data, format: r.format, sessionId: r.session_id, durationMs: r.duration_ms ?? null }
}

/** Re-read the stored object and independently re-verify integrity. Updates the
 * row and returns the verdict — the endpoint an auditor calls. */
export async function verifyRecording(recordingId: string, db: Pool = getPamDb()): Promise<{ ok: boolean; detail: string }> {
  const { rows } = await db.query('SELECT * FROM pam.session_recordings WHERE id=$1', [recordingId])
  const r = rows[0]
  if (!r || !r.storage_key) return { ok: false, detail: 'recording not found or has no stored object' }
  let ok = false
  let detail = ''
  try {
    const blob = await getStorage().get(r.storage_key)
    const rereadDigest = checksum(blob)
    const payload = signedPayload(r.session_id, r.storage_key, blob.length, r.checksum)
    const digestMatch = rereadDigest === r.checksum
    const sigOk = !!r.signature && verifyIntegrity(payload, r.signature)
    ok = digestMatch && sigOk
    detail = ok ? 'verified: re-read digest + signature match the sealed metadata'
      : `TAMPERED or corrupt: digestMatch=${digestMatch} sigOk=${sigOk} (stored=${r.checksum}, reread=${rereadDigest})`
  } catch (e: any) {
    detail = `re-read failed: ${String(e?.message || e)}`
  }
  await db.query('UPDATE pam.session_recordings SET integrity_ok=$2, integrity_checked_at=$3, integrity_detail=$4 WHERE id=$1',
    [recordingId, ok, nowIso(), detail])
  if (!ok) await recordRisk({ ruleKey: 'recording_integrity_failure', sessionId: r.session_id, explanation: `Recording ${recordingId}: ${detail}` }, db).catch(() => {})
  return { ok, detail }
}
