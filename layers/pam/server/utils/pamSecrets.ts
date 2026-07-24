import type { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { openSecretValue, storeSecretVersion } from './pamVault'

/**
 * Secrets lifecycle: version list/activate(rollback), ENFORCED leases
 * (one-time + TTL — the prior code mis-used credential_leases and never
 * recorded a lease), and dynamic (generate-on-read) secrets. Values are always
 * envelope-encrypted via pamVault; nothing here logs plaintext.
 */

export async function listVersions(secretId: string, db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT version, active, created_at, created_by, retired_at FROM pam.secret_versions WHERE secret_id=$1 ORDER BY version DESC', [secretId])).rows
}

/** Activate a specific (prior) version — rollback. Retires the current active one. */
export async function activateVersion(secretId: string, version: number, actor: string, db: Pool = getPamDb()): Promise<void> {
  const exists = (await db.query('SELECT 1 FROM pam.secret_versions WHERE secret_id=$1 AND version=$2', [secretId, version])).rowCount
  if (!exists) throw createError({ statusCode: 404, statusMessage: `Version ${version} not found` })
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pam.secret.${secretId}`])
    await client.query('UPDATE pam.secret_versions SET active=false, retired_at=$2 WHERE secret_id=$1 AND active=true', [secretId, nowIso()])
    await client.query('UPDATE pam.secret_versions SET active=true, retired_at=NULL WHERE secret_id=$1 AND version=$2', [secretId, version])
    await client.query('UPDATE pam.secrets SET current_version=$2, updated_at=$3, updated_by=$4 WHERE id=$1', [secretId, version, nowIso(), actor])
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e } finally { client.release() }
}

function genValue(kind: string): string {
  switch (kind) {
    case 'password': return randomBytes(18).toString('base64url')
    case 'api_token': return 'sk_' + randomBytes(24).toString('base64url')
    default: return randomBytes(24).toString('hex')
  }
}

/**
 * Authorize + open a secret for an application, enforcing the policy's TTL and
 * one-time semantics, and generating a fresh value for dynamic secrets. Returns
 * the value + lease, or throws 409 when a one-time secret was already consumed
 * for the current version.
 */
export async function leaseAndOpen(
  app: { applicationId: string; applicationName: string },
  secret: { id: string; path: string; dynamic?: boolean; dynamic_config?: unknown; secret_type?: string },
  policy: { leaseTtl: number; oneTime: boolean },
  opts: { version?: number; sourceIp?: string | null } = {},
  db: Pool = getPamDb()
): Promise<{ value: string; version: number; leaseId: string; oneTime: boolean; dynamic: boolean; leaseTtlSeconds: number }> {
  const now = Date.now()

  if (secret.dynamic) {
    // Dynamic secret: mint a fresh, leased value each read (no stored version).
    const value = genValue(secret.secret_type || 'password')
    const leaseId = newId()
    await db.query(
      `INSERT INTO pam.secret_leases (id, secret_id, application_id, version, lessee, one_time, ttl_seconds, dynamic, source_ip, issued_at, expires_at, consumed_at)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,true,$7,$8,$9,$8)`,
      [leaseId, secret.id, app.applicationId, `app:${app.applicationName}`, policy.oneTime, policy.leaseTtl, opts.sourceIp ?? null, new Date(now).toISOString(), new Date(now + policy.leaseTtl * 1000).toISOString()]
    )
    return { value, version: 0, leaseId, oneTime: policy.oneTime, dynamic: true, leaseTtlSeconds: policy.leaseTtl }
  }

  const opened = await openSecretValue(secret.id, opts.version, db)
  if (!opened) throw createError({ statusCode: 409, statusMessage: 'Secret has no value version' })

  // One-time enforcement: block a re-read of the SAME version once consumed
  // (rotating to a new version re-enables retrieval).
  if (policy.oneTime) {
    const consumed = await db.query(
      "SELECT 1 FROM pam.secret_leases WHERE secret_id=$1 AND application_id=$2 AND version=$3 AND one_time=true AND consumed_at IS NOT NULL LIMIT 1",
      [secret.id, app.applicationId, opened.version]
    )
    if (consumed.rowCount) {
      throw createError({ statusCode: 409, statusMessage: 'One-time secret already retrieved for this version — rotate the secret to re-issue' })
    }
  }

  const leaseId = newId()
  await db.query(
    `INSERT INTO pam.secret_leases (id, secret_id, application_id, version, lessee, one_time, ttl_seconds, dynamic, source_ip, issued_at, expires_at, consumed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11)`,
    [leaseId, secret.id, app.applicationId, opened.version, `app:${app.applicationName}`, policy.oneTime, policy.leaseTtl, opts.sourceIp ?? null,
      new Date(now).toISOString(), new Date(now + policy.leaseTtl * 1000).toISOString(), policy.oneTime ? new Date(now).toISOString() : null]
  )
  return { value: opened.value, version: opened.version, leaseId, oneTime: policy.oneTime, dynamic: false, leaseTtlSeconds: policy.leaseTtl }
}

/** Purge expired leases (housekeeping). */
export async function purgeExpiredSecretLeases(db: Pool = getPamDb()): Promise<number> {
  const { rowCount } = await db.query('DELETE FROM pam.secret_leases WHERE expires_at < $1 AND (one_time=false OR consumed_at IS NULL)', [nowIso()])
  return rowCount ?? 0
}

export { storeSecretVersion }
