import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { storeCredentialVersion } from '../../../layers/pam/server/utils/pamVault'
import {
  createSource, testSource, runScan, createRule, simulateRules, bulkAction, listSources
} from '../../../layers/pam/server/utils/pamDiscovery'
import { createRunner, authenticateRunner, claimForRunner, reportForRunner } from '../../../layers/pam/server/utils/pamRunner'

/**
 * Real discovery E2E: a `postgresql` source scans the live Postgres via the
 * built-in connector's discover (enumerates login roles), populates the pending
 * queue (deduped), and an onboarding rule auto-onboards a matching account into
 * a safe. Proves the engine + a real connector + real target end-to-end.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool

async function makeCredentialAccount(): Promise<{ safeId: string; accountId: string }> {
  const safeId = nanoid(); const accountId = nanoid()
  await pool.query('INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,$2,$3,$4)', [safeId, 'Discovery Safe', `disc-${safeId}`, new Date().toISOString()])
  // Credential account = the privileged PG role used to scan (points at THIS db).
  await pool.query('INSERT INTO pam.accounts (id,name,username,address,port,safe_id,account_type,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [accountId, 'pam@pg', 'pam', '127.0.0.1', 55432, safeId, 'database', new Date().toISOString()])
  await storeCredentialVersion({ accountId, plaintext: 'pam', source: 'manual', createdBy: 'it' }, pool)
  return { safeId, accountId }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}) })

describe('discovery — source test + real scan', () => {
  it('tests a postgresql source and scans real login roles into the pending queue', async () => {
    const { accountId } = await makeCredentialAccount()
    const sourceId = await createSource({ name: 'PG scan', sourceType: 'postgresql', config: { database: 'pam_test', port: 55432 }, credentialAccountId: accountId, actor: 'it' }, pool)

    expect((await listSources(pool)).some((s) => s.id === sourceId)).toBe(true)
    const t = await testSource(sourceId, pool)
    expect(t.ok).toBe(true)

    const scan = await runScan(sourceId, { actor: 'it' }, pool)
    expect(scan.total).toBeGreaterThan(0)
    const discovered = (await pool.query("SELECT username, status FROM pam.discovered_accounts WHERE source_id=$1", [sourceId])).rows
    expect(discovered.some((d) => d.username === 'pam')).toBe(true)
    // A run record was written with counts.
    const run = (await pool.query('SELECT * FROM pam.discovery_runs WHERE id=$1', [scan.runId])).rows[0]
    expect(run.status).toBe('succeeded')
    expect(Number(run.accounts_found)).toBeGreaterThan(0)
  })
})

describe('discovery — rule-driven auto-onboarding', () => {
  it('auto-onboards a matching discovered account into the assigned safe', async () => {
    const { safeId, accountId } = await makeCredentialAccount()
    // Rule created BEFORE the scan so applyRulesToRun onboards during the scan.
    await createRule({ name: 'onboard pam', priority: 10, action: 'onboard', assignSafeId: safeId, autoManage: false, conditions: { field: 'username', op: 'eq', value: 'pam' }, createdBy: 'it' }, pool)
    const sourceId = await createSource({ name: 'PG scan 2', sourceType: 'postgresql', config: { database: 'pam_test', port: 55432 }, credentialAccountId: accountId, actor: 'it' }, pool)

    const scan = await runScan(sourceId, { actor: 'it' }, pool)
    expect(scan.applied.onboarded).toBeGreaterThanOrEqual(1)

    const disc = (await pool.query("SELECT status, onboarded_account_id, matched_rule_id FROM pam.discovered_accounts WHERE source_id=$1 AND username='pam'", [sourceId])).rows[0]
    expect(disc.status).toBe('onboarded')
    expect(disc.onboarded_account_id).toBeTruthy()
    expect(disc.matched_rule_id).toBeTruthy()
    const onboarded = (await pool.query('SELECT * FROM pam.accounts WHERE id=$1', [disc.onboarded_account_id])).rows[0]
    expect(onboarded.username).toBe('pam')
    expect(onboarded.safe_id).toBe(safeId)
    expect(onboarded.discovery_source).toBe('discovery')
  })
})

describe('discovery — runner-delegated scan (dispatch → claim → report → queue)', () => {
  it('dispatches a runner connector scan, and the runner report populates the queue', async () => {
    const { accountId } = await makeCredentialAccount()
    // A linux-ssh source is a runner-delegated connector → scan dispatches a job.
    const sourceId = await createSource({ name: 'Linux hosts', sourceType: 'linux-ssh', config: {}, credentialAccountId: accountId, actor: 'it' }, pool)
    const dispatch = await runScan(sourceId, { actor: 'it' }, pool)
    expect(dispatch.dispatched).toBe('runner')

    // A runner claims the discover job and reports the enumerated accounts.
    const runner = await authenticateRunner((await createRunner({ name: 'disc-runner', connectorAllowlist: ['linux-ssh'] }, pool)).token, pool)
    const claim = await claimForRunner(runner, pool)
    expect(claim?.jobType).toBe('discover')
    const report = await reportForRunner(runner, claim.jobId, { ok: true, action: 'discover', accounts: [{ username: 'root', privilege_level: 'root' }, { username: 'deploy', privilege_level: 'user' }] } as any, pool)
    expect(report.ok).toBe(true)

    const found = (await pool.query('SELECT username FROM pam.discovered_accounts WHERE source_id=$1', [sourceId])).rows.map((r) => r.username)
    expect(found).toContain('root')
    expect(found).toContain('deploy')
  })
})

describe('discovery — rule simulation + bulk actions', () => {
  it('simulates rules without side effects and applies bulk ignore', async () => {
    const { accountId } = await makeCredentialAccount()
    await createRule({ name: 'ignore templates', priority: 5, action: 'ignore', conditions: { field: 'username', op: 'startsWith', value: 'pg_' }, createdBy: 'it' }, pool)
    const sim = await simulateRules({ username: 'pg_signal_backend', privilege_level: 'user' }, pool)
    expect(sim.matched?.action).toBe('ignore')

    const sourceId = await createSource({ name: 'PG scan 3', sourceType: 'postgresql', config: { database: 'pam_test', port: 55432 }, credentialAccountId: accountId, actor: 'it' }, pool)
    await runScan(sourceId, { actor: 'it' }, pool)
    const pendingId = (await pool.query("SELECT id FROM pam.discovered_accounts WHERE source_id=$1 AND status='pending' LIMIT 1", [sourceId])).rows[0]?.id
    if (pendingId) {
      const res = await bulkAction([pendingId], 'ignore', {}, pool)
      expect(res.affected).toBe(1)
      expect((await pool.query('SELECT status FROM pam.discovered_accounts WHERE id=$1', [pendingId])).rows[0].status).toBe('ignored')
    }
  })
})
