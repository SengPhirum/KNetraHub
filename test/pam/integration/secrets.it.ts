import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { storeSecretVersion, openSecretValue } from '../../../layers/pam/server/utils/pamVault'
import { listVersions, activateVersion, leaseAndOpen } from '../../../layers/pam/server/utils/pamSecrets'

/**
 * Secrets lifecycle: version rollback, ENFORCED one-time leases (the prior
 * implementation never recorded a lease), and dynamic generate-on-read.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const now = () => new Date().toISOString()

async function makeSecret(over: { dynamic?: boolean } = {}): Promise<string> {
  const id = nanoid()
  await pool.query('INSERT INTO pam.secrets (id,name,path,secret_type,dynamic,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, 'sec', `app/${id}`, over.dynamic ? 'api_token' : 'kv', !!over.dynamic, now()])
  return id
}
const app = { applicationId: 'app-1', applicationName: 'ci-app' }

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('secret version lifecycle + rollback', () => {
  it('lists versions and rolls back to a prior version', async () => {
    const id = await makeSecret()
    await storeSecretVersion(id, 'value-v1', 'admin', pool)
    await storeSecretVersion(id, 'value-v2', 'admin', pool)
    const versions = await listVersions(id, pool)
    expect(versions.map((v) => v.version)).toEqual([2, 1])
    expect((await openSecretValue(id, undefined, pool))!.value).toBe('value-v2') // active = latest

    await activateVersion(id, 1, 'admin', pool) // rollback
    expect((await openSecretValue(id, undefined, pool))!.value).toBe('value-v1')
    const after = await listVersions(id, pool)
    expect(after.find((v) => v.version === 1).active).toBe(true)
    expect(after.find((v) => v.version === 2).active).toBe(false)
  })
})

describe('one-time lease enforcement', () => {
  it('allows a single retrieval per version and blocks re-reads until rotated', async () => {
    const id = await makeSecret()
    await storeSecretVersion(id, 'one-time-v1', 'admin', pool)
    const secret = { id, path: `app/${id}`, dynamic: false }
    const policy = { leaseTtl: 300, oneTime: true }

    const first = await leaseAndOpen(app, secret, policy, {}, pool)
    expect(first.value).toBe('one-time-v1')
    // Second read of the SAME version is rejected.
    await expect(leaseAndOpen(app, secret, policy, {}, pool)).rejects.toMatchObject({ statusCode: 409 })

    // Rotating to a new version re-enables retrieval.
    await storeSecretVersion(id, 'one-time-v2', 'admin', pool)
    const third = await leaseAndOpen(app, secret, policy, {}, pool)
    expect(third.value).toBe('one-time-v2')
    // A lease row was actually recorded (the prior code silently failed to).
    expect((await pool.query('SELECT count(*)::int c FROM pam.secret_leases WHERE secret_id=$1', [id])).rows[0].c).toBeGreaterThanOrEqual(2)
  })
})

describe('dynamic secrets', () => {
  it('mints a fresh leased value on each read', async () => {
    const id = await makeSecret({ dynamic: true })
    const secret = { id, path: `app/${id}`, dynamic: true, secret_type: 'api_token' }
    const a = await leaseAndOpen(app, secret, { leaseTtl: 60, oneTime: false }, {}, pool)
    const b = await leaseAndOpen(app, secret, { leaseTtl: 60, oneTime: false }, {}, pool)
    expect(a.dynamic).toBe(true)
    expect(a.value).not.toBe(b.value) // fresh each time
    expect(a.value.startsWith('sk_')).toBe(true)
  })
})
