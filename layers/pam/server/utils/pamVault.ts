import type { Pool, PoolClient } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { seal, open } from './pamCrypto'
import { newId, nowIso } from './pamStore'

/**
 * The credential/secret store: the ONLY module that turns plaintext into a
 * stored credential version and back. It seals values with the envelope vault
 * (pamCrypto), writes the ciphertext columns, advances the account/secret
 * active-version pointer transactionally, and issues time-boxed leases. No
 * other code path persists or returns credential plaintext.
 */

export interface StoreCredentialInput {
  accountId: string
  plaintext: string
  valueType?: string
  source?: 'manual' | 'rotation' | 'onboard' | 'reconcile' | 'import'
  createdBy: string
}

/** Seal a new credential version and make it active (transactional). */
export async function storeCredentialVersion(input: StoreCredentialInput, db: Pool = getPamDb()): Promise<number> {
  const sealed = seal(input.plaintext)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pam.cred.${input.accountId}`])
    const { rows: verRows } = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM pam.credential_versions WHERE account_id = $1',
      [input.accountId]
    )
    const version = Number(verRows[0].next)
    await client.query('UPDATE pam.credential_versions SET active = false, retired_at = $2 WHERE account_id = $1 AND active = true', [input.accountId, nowIso()])
    await client.query(
      `INSERT INTO pam.credential_versions
        (id, account_id, version, value_type, algo, key_version, wrapped_dek, value_ciphertext, active, source, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11)`,
      [newId(), input.accountId, version, input.valueType ?? 'password', sealed.algo, sealed.keyVersion,
        sealed.wrappedDek, sealed.valueCiphertext, input.source ?? 'manual', nowIso(), input.createdBy]
    )
    await client.query(
      'UPDATE pam.accounts SET current_credential_version = $2, last_changed = $3, updated_at = $3, updated_by = $4 WHERE id = $1',
      [input.accountId, version, nowIso(), input.createdBy]
    )
    await client.query('COMMIT')
    return version
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Decrypt and return the active credential plaintext (server-only; audit at call site). */
export async function openActiveCredential(accountId: string, db: Pool = getPamDb()): Promise<{ version: number; value: string; valueType: string } | null> {
  const { rows } = await db.query(
    'SELECT version, value_type, key_version, wrapped_dek, value_ciphertext FROM pam.credential_versions WHERE account_id = $1 AND active = true LIMIT 1',
    [accountId]
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    version: Number(r.version),
    valueType: r.value_type,
    value: open({ keyVersion: Number(r.key_version), wrappedDek: r.wrapped_dek, valueCiphertext: r.value_ciphertext })
  }
}

/** Decrypt a specific credential version (used for verify/reconcile against a target). */
export async function openCredentialVersion(accountId: string, version: number, db: Pool = getPamDb()): Promise<string | null> {
  const { rows } = await db.query(
    'SELECT key_version, wrapped_dek, value_ciphertext FROM pam.credential_versions WHERE account_id = $1 AND version = $2 LIMIT 1',
    [accountId, version]
  )
  if (!rows.length) return null
  const r = rows[0]
  return open({ keyVersion: Number(r.key_version), wrappedDek: r.wrapped_dek, valueCiphertext: r.value_ciphertext })
}

export interface LeaseInput {
  accountId: string
  credentialVersion: number | null
  lessee: string
  leaseType: 'reveal' | 'use' | 'session' | 'application'
  ttlSeconds: number
  requestId?: string | null
  sessionId?: string | null
  sourceIp?: string | null
  oneTime?: boolean
}

/** Record a credential lease (checkout) with an expiry; returns the lease id. */
export async function createLease(input: LeaseInput, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  const now = Date.now()
  await db.query(
    `INSERT INTO pam.credential_leases
      (id, account_id, credential_version, lessee, lease_type, request_id, session_id, source_ip, one_time, issued_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, input.accountId, input.credentialVersion, input.lessee, input.leaseType,
      input.requestId ?? null, input.sessionId ?? null, input.sourceIp ?? null, input.oneTime ?? false,
      new Date(now).toISOString(), new Date(now + input.ttlSeconds * 1000).toISOString()]
  )
  return id
}

// ── Secrets (application/workload) ────────────────────────────────────────────

/** Seal a new secret version and make it active (transactional). */
export async function storeSecretVersion(secretId: string, plaintext: string, createdBy: string, db: Pool = getPamDb()): Promise<number> {
  const sealed = seal(plaintext)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pam.secret.${secretId}`])
    const { rows } = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM pam.secret_versions WHERE secret_id = $1', [secretId])
    const version = Number(rows[0].next)
    await client.query('UPDATE pam.secret_versions SET active = false, retired_at = $2 WHERE secret_id = $1 AND active = true', [secretId, nowIso()])
    await client.query(
      `INSERT INTO pam.secret_versions (id, secret_id, version, algo, key_version, wrapped_dek, value_ciphertext, active, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
      [newId(), secretId, version, sealed.algo, sealed.keyVersion, sealed.wrappedDek, sealed.valueCiphertext, nowIso(), createdBy]
    )
    await client.query('UPDATE pam.secrets SET current_version = $2, updated_at = $3, updated_by = $4 WHERE id = $1', [secretId, version, nowIso(), createdBy])
    await client.query('COMMIT')
    return version
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Decrypt a secret version (defaults to active). Audit/policy enforced at call site. */
export async function openSecretValue(secretId: string, version?: number, db: Pool = getPamDb()): Promise<{ version: number; value: string } | null> {
  const { rows } = await db.query(
    version
      ? 'SELECT version, key_version, wrapped_dek, value_ciphertext FROM pam.secret_versions WHERE secret_id = $1 AND version = $2 LIMIT 1'
      : 'SELECT version, key_version, wrapped_dek, value_ciphertext FROM pam.secret_versions WHERE secret_id = $1 AND active = true LIMIT 1',
    version ? [secretId, version] : [secretId]
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    version: Number(r.version),
    value: open({ keyVersion: Number(r.key_version), wrappedDek: r.wrapped_dek, valueCiphertext: r.value_ciphertext })
  }
}

/** Rewrap every stored DEK under the active master-key version (online rotation). */
export async function rewrapAll(db: Pool = getPamDb()): Promise<{ credentials: number; secrets: number }> {
  const { rewrap } = await import('./pamCrypto')
  const activeVersion = (await import('./pamCrypto')).activeKeyVersion()
  let credentials = 0
  let secrets = 0

  const cred = await db.query('SELECT id, key_version, wrapped_dek, value_ciphertext, algo FROM pam.credential_versions WHERE key_version <> $1', [activeVersion])
  for (const r of cred.rows) {
    const next = rewrap({ algo: r.algo, keyVersion: Number(r.key_version), wrappedDek: r.wrapped_dek, valueCiphertext: r.value_ciphertext })
    await db.query('UPDATE pam.credential_versions SET key_version = $2, wrapped_dek = $3 WHERE id = $1', [r.id, next.keyVersion, next.wrappedDek])
    credentials++
  }
  const sec = await db.query('SELECT id, key_version, wrapped_dek, value_ciphertext, algo FROM pam.secret_versions WHERE key_version <> $1', [activeVersion])
  for (const r of sec.rows) {
    const next = rewrap({ algo: r.algo, keyVersion: Number(r.key_version), wrappedDek: r.wrapped_dek, valueCiphertext: r.value_ciphertext })
    await db.query('UPDATE pam.secret_versions SET key_version = $2, wrapped_dek = $3 WHERE id = $1', [r.id, next.keyVersion, next.wrappedDek])
    secrets++
  }
  return { credentials, secrets }
}

export type { PoolClient }
