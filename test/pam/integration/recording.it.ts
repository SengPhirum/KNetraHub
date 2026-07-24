import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { storeRecording, openRecording, verifyRecording } from '../../../layers/pam/server/utils/pamRecording'
import { _resetStorage } from '../../../layers/pam/server/utils/pamStorage'

/**
 * Proves the recording pipeline against real storage: encrypt → store →
 * INDEPENDENT re-read verification → decrypt → tamper-detection. The prior
 * implementation stored NO bytes and marked integrity from a gateway-supplied
 * checksum; this asserts real ciphertext at rest and independent verification.
 */

const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const PLAINTEXT = Buffer.from('[[{"version":2,"width":120}]]\n[0.5,"o","root@host:~# whoami\\r\\n"]\n[0.6,"o","root\\r\\n"]\nSENTINEL-whoami-output-marker\n'.repeat(20))

async function makeSession(): Promise<string> {
  const id = nanoid()
  await pool.query('INSERT INTO pam.sessions (id, principal, target, protocol, recording_required, started_at) VALUES ($1,$2,$3,$4,true,$5)',
    [id, 'alice', '10.10.10.10', 'ssh', new Date().toISOString()])
  return id
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1') // fail loudly if no DB
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}) })

describe('recording pipeline — filesystem backend', () => {
  let recDir: string
  beforeAll(async () => {
    recDir = join(tmpdir(), `pam-rec-${nanoid()}`)
    process.env.PAM_STORAGE_BACKEND = 'fs'
    process.env.PAM_RECORDING_DIR = recDir
    _resetStorage()
  })

  it('stores encrypted bytes at rest and verifies integrity independently', async () => {
    const sessionId = await makeSession()
    const res = await storeRecording({ sessionId, data: PLAINTEXT, format: 'asciicast', durationMs: 1234 }, pool)
    expect(res.integrityOk).toBe(true)
    expect(res.size).toBeGreaterThan(PLAINTEXT.length) // GCM tag + ciphertext

    // The object on disk is CIPHERTEXT — the plaintext sentinel must be absent.
    const row = (await pool.query('SELECT * FROM pam.session_recordings WHERE id=$1', [res.id])).rows[0]
    expect(row.storage_backend).toBe('fs')
    expect(row.integrity_ok).toBe(true)
    const onDisk = await fs.readFile(join(recDir, row.storage_key))
    expect(onDisk.includes(Buffer.from('SENTINEL-whoami-output-marker'))).toBe(false)
    expect(onDisk.length).toBe(Number(row.size_bytes))

    // session marked stored
    const sess = (await pool.query('SELECT recording_status FROM pam.sessions WHERE id=$1', [sessionId])).rows[0]
    expect(sess.recording_status).toBe('stored')
  })

  it('decrypts back to the exact original bytes', async () => {
    const sessionId = await makeSession()
    const res = await storeRecording({ sessionId, data: PLAINTEXT, format: 'asciicast' }, pool)
    const opened = await openRecording(res.id, pool)
    expect(opened).toBeTruthy()
    expect(Buffer.compare(opened!.data, PLAINTEXT)).toBe(0)
  })

  it('independent verify passes for an untouched object and FAILS for a tampered one', async () => {
    const sessionId = await makeSession()
    const res = await storeRecording({ sessionId, data: PLAINTEXT }, pool)
    expect((await verifyRecording(res.id, pool)).ok).toBe(true)

    // Tamper with the stored ciphertext on disk.
    const row = (await pool.query('SELECT storage_key FROM pam.session_recordings WHERE id=$1', [res.id])).rows[0]
    const p = join(recDir, row.storage_key)
    const buf = await fs.readFile(p)
    buf[buf.length - 1] ^= 0xff
    await fs.writeFile(p, buf)

    const verdict = await verifyRecording(res.id, pool)
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toContain('TAMPERED')
    // A tampered object must also fail to decrypt (GCM auth tag).
    await expect(openRecording(res.id, pool)).rejects.toThrow()
  })
})

const S3_ENABLED = !!process.env.PAM_TEST_S3_ENDPOINT
;(S3_ENABLED ? describe : describe.skip)('recording pipeline — S3/MinIO backend (SigV4)', () => {
  beforeAll(() => {
    process.env.PAM_STORAGE_BACKEND = 's3'
    process.env.PAM_S3_ENDPOINT = process.env.PAM_TEST_S3_ENDPOINT!
    process.env.PAM_S3_BUCKET = process.env.PAM_TEST_S3_BUCKET || 'pam-recordings'
    process.env.PAM_S3_ACCESS_KEY = process.env.PAM_TEST_S3_ACCESS_KEY || 'pamadmin'
    process.env.PAM_S3_SECRET_KEY = process.env.PAM_TEST_S3_SECRET_KEY || 'pamadmin123'
    process.env.PAM_S3_REGION = 'us-east-1'
    process.env.PAM_S3_FORCE_PATH_STYLE = 'true'
    _resetStorage()
  })

  it('stores, verifies, and decrypts through S3-compatible storage', async () => {
    const sessionId = await makeSession()
    const res = await storeRecording({ sessionId, data: PLAINTEXT, format: 'asciicast' }, pool)
    expect(res.integrityOk).toBe(true)
    const opened = await openRecording(res.id, pool)
    expect(Buffer.compare(opened!.data, PLAINTEXT)).toBe(0)
    expect((await verifyRecording(res.id, pool)).ok).toBe(true)
  })
})
