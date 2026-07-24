import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { createOrg, invite, acceptInvitation, checkAccess, autoSuspendExpired, suspendOrg } from '../../../layers/pam/server/utils/pamVendor'

/**
 * Vendor access lifecycle (spec §10): org → invitation (one-time token) →
 * accept → access allowed; contract expiry auto-suspends and BLOCKS access;
 * manual suspend blocks immediately.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const future = () => new Date(Date.now() + 86400000).toISOString()

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('vendor invitation → accept → access', () => {
  it('grants access to an accepted vendor user within contract, and enforces the token', async () => {
    const vendorId = await createOrg({ name: 'Acme Contractors', sponsor: 'alice', contractEnd: future(), allowedNetworks: ['10.0.0.0/8'], actor: 'admin' }, pool)
    const { token } = await invite(vendorId, 'contractor@acme.example', 3600, 'admin', pool)

    // Wrong token rejected; terms required.
    await expect(acceptInvitation('vinv_wrong', { termsAccepted: true }, pool)).rejects.toBeTruthy()
    await expect(acceptInvitation(token, { termsAccepted: false }, pool)).rejects.toBeTruthy()

    const { vendorUserId } = await acceptInvitation(token, { displayName: 'Bob', mfaVerified: true, termsAccepted: true }, pool)
    // Token is single-use — a second accept fails.
    await expect(acceptInvitation(token, { termsAccepted: true }, pool)).rejects.toBeTruthy()

    // Access allowed from an in-policy network, denied from outside it.
    expect((await checkAccess(vendorUserId, { ip: '10.1.2.3' }, pool)).allowed).toBe(true)
    expect((await checkAccess(vendorUserId, { ip: '192.168.1.1' }, pool)).allowed).toBe(false)
  })
})

describe('vendor auto-suspension', () => {
  it('auto-suspends on contract expiry and blocks access', async () => {
    const vendorId = await createOrg({ name: 'Expired Inc', contractEnd: future(), actor: 'admin' }, pool)
    const { token } = await invite(vendorId, 'x@expired.example', 3600, 'admin', pool)
    const { vendorUserId } = await acceptInvitation(token, { termsAccepted: true }, pool)
    expect((await checkAccess(vendorUserId, {}, pool)).allowed).toBe(true)

    // Expire the contract in the past, then run the auto-suspend sweep.
    await pool.query("UPDATE pam.vendors SET contract_end=$2 WHERE id=$1", [vendorId, new Date(Date.now() - 1000).toISOString()])
    const suspended = await autoSuspendExpired(pool)
    expect(suspended).toBeGreaterThanOrEqual(1)

    const verdict = await checkAccess(vendorUserId, {}, pool)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/expired/)
  })

  it('manual suspend blocks access immediately', async () => {
    const vendorId = await createOrg({ name: 'Manual Suspend Co', contractEnd: future(), actor: 'admin' }, pool)
    const { token } = await invite(vendorId, 'y@ms.example', 3600, 'admin', pool)
    const { vendorUserId } = await acceptInvitation(token, { termsAccepted: true }, pool)
    await suspendOrg(vendorId, 'policy violation', pool)
    expect((await checkAccess(vendorUserId, {}, pool)).allowed).toBe(false)
  })
})
