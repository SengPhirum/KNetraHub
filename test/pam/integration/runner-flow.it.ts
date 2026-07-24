import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import {
  createRunner, authenticateRunner, revokeRunner, claimForRunner, reportForRunner,
  seedRunnerConnectorRegistry, runnerConfig, connectorSigningKey
} from '../../../layers/pam/server/utils/pamRunner'
import { verifyConnectorPackage } from '../../../layers/pam/server/utils/pamRunnerCore'
import { enqueueJob, claimJob } from '../../../layers/pam/server/utils/pamJobs'
import { storeCredentialVersion, openActiveCredential } from '../../../layers/pam/server/utils/pamVault'

/**
 * Proves the runner control plane end-to-end against a REAL PostgreSQL:
 *   runner identity → job delegation → claim (server-generated new credential)
 *   → report → verify-before-seal → idempotency → in-process isolation.
 * Fails loudly (throws in beforeAll) when no database is reachable.
 */

const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool

const now = () => new Date().toISOString()

async function makeLinuxAccount(initialPassword: string): Promise<{ accountId: string; safeId: string; platformId: string }> {
  const safeId = nanoid(); const platformId = nanoid(); const accountId = nanoid()
  await pool.query('INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,$2,$3,$4)', [safeId, 'IT Safe', `it-${safeId}`, now()])
  await pool.query('INSERT INTO pam.platforms (id,name,slug,base_type,connector_key,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [platformId, 'Linux SSH', `it-linux-${platformId}`, 'linux-ssh', 'linux-ssh', now()])
  await pool.query('INSERT INTO pam.accounts (id,name,username,address,port,safe_id,platform_id,account_type,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [accountId, 'root@host', 'root', '10.10.10.10', 22, safeId, platformId, 'linux', now()])
  await storeCredentialVersion({ accountId, plaintext: initialPassword, source: 'manual', createdBy: 'it' }, pool)
  return { accountId, safeId, platformId }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  // Fail loudly if the DB is unreachable — this suite must never silently pass.
  await pool.query('SELECT 1')
  // Clean slate for deterministic isolation (disposable test DB).
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
  await seedRunnerConnectorRegistry(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}) })

describe('runner registry seeding + signature gate', () => {
  it('seeds signed, digest-bearing registry rows for runner connectors', async () => {
    const { rows } = await pool.query("SELECT * FROM pam.connectors WHERE connector_key='linux-ssh'")
    expect(rows.length).toBe(1)
    const r = rows[0]
    expect(r.sha256).toBeTruthy()
    expect(r.signature).toBeTruthy()
    expect(r.enabled && r.trusted && r.activation_status === 'active').toBe(true)
    // The stored signature verifies for the recorded digest, and a tampered
    // digest is rejected by the same gate the runner uses.
    const entry = { connector_key: r.connector_key, version: r.version, sha256: r.sha256, signature: r.signature, enabled: r.enabled, trusted: r.trusted, activation_status: r.activation_status, compatibility: r.compatibility }
    expect(verifyConnectorPackage({ key: r.connector_key, version: r.version, sha256: r.sha256 }, entry, connectorSigningKey()).ok).toBe(true)
    expect(verifyConnectorPackage({ key: r.connector_key, version: r.version, sha256: 'f'.repeat(64) }, entry, connectorSigningKey()).errorCode).toBe('digest_mismatch')
  })
})

describe('runner identity', () => {
  it('authenticates by token, rejects wrong/revoked tokens (fail closed)', async () => {
    const created = await createRunner({ name: 'it-runner-auth', connectorAllowlist: ['linux-ssh'] }, pool)
    expect(created.token.startsWith('rnr_')).toBe(true)
    const authed = await authenticateRunner(created.token, pool)
    expect(authed?.id).toBe(created.id)
    expect(await authenticateRunner('rnr_wrong-token', pool)).toBeNull()
    await revokeRunner(created.id, pool)
    expect(await authenticateRunner(created.token, pool)).toBeNull()
  })
})

describe('delegated rotate: claim → verified change → seal', () => {
  it('generates the new credential server-side and seals it only after a verified change', async () => {
    const { accountId } = await makeLinuxAccount('old-password-123')
    const runner = await authenticateRunner((await createRunner({ name: 'it-runner-rot', connectorAllowlist: ['linux-ssh'] }, pool)).token, pool)

    await enqueueJob({ jobType: 'rotate', accountId, handler: 'runner', connectorKey: 'linux-ssh', trigger: 'it' }, pool)

    // An in-process worker must NOT be able to claim a runner-delegated job.
    expect(await claimJob('it-inproc-worker', pool)).toBeNull()

    const claim = await claimForRunner(runner, pool)
    expect(claim).toBeTruthy()
    expect(claim.action).toBe('change')
    expect(claim.connector.key).toBe('linux-ssh')
    expect(claim.connector.sha256 && claim.connector.signature).toBeTruthy()
    const newPassword = claim.ctx.newCredential as string
    expect(newPassword).toBeTruthy()
    expect(newPassword).not.toBe('old-password-123')
    // The current credential handed to the runner is the real active one.
    expect(claim.ctx.currentCredential).toBe('old-password-123')

    const report = await reportForRunner(runner, claim.jobId, { ok: true, action: 'change', targetChanged: true, verified: true, detail: 'password changed and re-authenticated' }, pool)
    expect(report).toMatchObject({ applied: true, ok: true })

    // The active credential is now the server-generated one; job succeeded.
    const active = await openActiveCredential(accountId, pool)
    expect(active?.value).toBe(newPassword)
    const job = (await pool.query('SELECT status, pending_secret, assigned_runner_id FROM pam.credential_jobs WHERE id=$1', [claim.jobId])).rows[0]
    expect(job.status).toBe('succeeded')
    expect(job.pending_secret).toBeNull()
    expect(job.assigned_runner_id).toBeNull()
    const acct = (await pool.query('SELECT rotation_status FROM pam.accounts WHERE id=$1', [accountId])).rows[0]
    expect(acct.rotation_status).toBe('managed')
  })
})

describe('delegated rotate: unverified change must NOT seal', () => {
  it('keeps the old credential and re-queues when the runner cannot verify', async () => {
    const { accountId } = await makeLinuxAccount('keep-me-safe-999')
    const runner = await authenticateRunner((await createRunner({ name: 'it-runner-unver', connectorAllowlist: ['linux-ssh'] }, pool)).token, pool)
    await enqueueJob({ jobType: 'rotate', accountId, handler: 'runner', connectorKey: 'linux-ssh', trigger: 'it' }, pool)
    const claim = await claimForRunner(runner, pool)

    const report = await reportForRunner(runner, claim.jobId, { ok: true, action: 'change', targetChanged: true, verified: false, retryable: true, detail: 'changed but could not re-authenticate' }, pool)
    expect(report).toMatchObject({ applied: true, ok: false })

    // Active credential unchanged (NOT locked out); job re-queued for retry.
    const active = await openActiveCredential(accountId, pool)
    expect(active?.value).toBe('keep-me-safe-999')
    const job = (await pool.query('SELECT status, pending_secret FROM pam.credential_jobs WHERE id=$1', [claim.jobId])).rows[0]
    expect(job.status).toBe('queued')
    expect(job.pending_secret).toBeNull()
  })
})

describe('report idempotency', () => {
  it('ignores a duplicate/late report after the job left the running state', async () => {
    const { accountId } = await makeLinuxAccount('idem-pass-1')
    const runner = await authenticateRunner((await createRunner({ name: 'it-runner-idem', connectorAllowlist: ['linux-ssh'] }, pool)).token, pool)
    await enqueueJob({ jobType: 'rotate', accountId, handler: 'runner', connectorKey: 'linux-ssh', trigger: 'it' }, pool)
    const claim = await claimForRunner(runner, pool)

    const first = await reportForRunner(runner, claim.jobId, { ok: true, action: 'change', targetChanged: true, verified: true }, pool)
    expect(first).toMatchObject({ applied: true, ok: true })
    const activeAfterFirst = (await openActiveCredential(accountId, pool))?.value

    // A replayed report is an idempotent no-op — no second seal / version bump.
    const second = await reportForRunner(runner, claim.jobId, { ok: true, action: 'change', targetChanged: true, verified: true }, pool)
    expect(second).toMatchObject({ applied: false, idempotent: true })
    expect((await openActiveCredential(accountId, pool))?.value).toBe(activeAfterFirst)
    const versions = (await pool.query('SELECT count(*)::int c FROM pam.credential_versions WHERE account_id=$1', [accountId])).rows[0].c
    expect(versions).toBe(2) // initial + one rotation, not three
  })
})

describe('runner config', () => {
  it('returns only allowlisted, enabled, active connectors with digests', async () => {
    const runner = await authenticateRunner((await createRunner({ name: 'it-runner-cfg', connectorAllowlist: ['linux-ssh'] }, pool)).token, pool)
    const cfg = await runnerConfig(runner, pool)
    expect(cfg.allowlist).toEqual(['linux-ssh'])
    expect(cfg.connectors.find((c: any) => c.key === 'linux-ssh')?.sha256).toBeTruthy()
    expect(cfg.connectors.find((c: any) => c.key === 'aws-iam')).toBeUndefined()
  })
})
