import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { execFileSync } from 'node:child_process'
import net from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client } from 'ldapts'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { requestJit, provisionJit, revokeJit, sweepDueJit } from '../../../layers/pam/server/utils/pamJit'

/**
 * Real JIT proof (spec §9 / §19.3): provision a privileged LDAP group membership,
 * confirm the principal IS a member, revoke, and confirm they are NO LONGER a
 * member — the "access works, then no longer works" gate. Uses a disposable
 * OpenLDAP; the entitlement state lives in the test Postgres.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
const LDAP_CID = 'pam-it-ldap'
const LDAP_PORT = 1389
const ROOT = 'dc=example,dc=org'
const GROUP = `cn=jitgroup,ou=groups,${ROOT}`
const USER = `cn=user01,ou=users,${ROOT}`
const LCFG = { url: `ldap://127.0.0.1:${LDAP_PORT}`, allowInsecure: true, bindDn: `cn=admin,${ROOT}`, bindPassword: 'adminpass', principalDn: USER, memberAttr: 'member' }
let pool: Pool
const sh = (c: string, a: string[]) => { try { return execFileSync(c, a, { encoding: 'utf8' }) } catch (e: any) { return e.stdout || '' } }

async function waitPort(port: number, ms = 45000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true) }); s.on('error', () => r(false)) })) return true; await sleep(500) }
  return false
}
async function members(): Promise<string[]> {
  const cl = new Client({ url: LCFG.url })
  try { await cl.bind(LCFG.bindDn, LCFG.bindPassword); const { searchEntries } = await cl.search(GROUP, { scope: 'base', attributes: ['member'] }); const v = (searchEntries[0] as any)?.member; return (Array.isArray(v) ? v : v ? [v] : []).map((m: string) => m.toLowerCase()) }
  finally { await cl.unbind().catch(() => {}) }
}

beforeAll(async () => {
  sh('docker', ['rm', '-f', LDAP_CID])
  sh('docker', ['run', '-d', '--name', LDAP_CID, '-p', `${LDAP_PORT}:1389`, '-e', 'LDAP_ADMIN_USERNAME=admin', '-e', 'LDAP_ADMIN_PASSWORD=adminpass', '-e', 'LDAP_USERS=user01', '-e', 'LDAP_PASSWORDS=pass01', '-e', `LDAP_ROOT=${ROOT}`, 'bitnamilegacy/openldap:latest'])
  if (!await waitPort(LDAP_PORT)) throw new Error('OpenLDAP did not start')
  await sleep(3000)
  // Seed a privileged group (groupOfNames needs a seed member).
  const cl = new Client({ url: LCFG.url })
  await cl.bind(LCFG.bindDn, LCFG.bindPassword)
  await cl.add(GROUP, { objectClass: ['groupOfNames'], cn: 'jitgroup', member: [LCFG.bindDn] }).catch(() => {})
  await cl.unbind().catch(() => {})

  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}); sh('docker', ['rm', '-f', LDAP_CID]) })

describe('JIT ldap-group: provision → verify → revoke → verify', () => {
  it('grants then removes real group membership, with independent verification', async () => {
    const id = await requestJit({ entitlementType: 'ldap-group', target: GROUP, principal: 'user01', config: LCFG, ttlSeconds: 300, requestedBy: 'alice' }, pool)

    // Before: user01 is NOT in the group.
    expect((await members()).includes(USER.toLowerCase())).toBe(false)

    const prov = await provisionJit(id, pool)
    expect(prov).toMatchObject({ ok: true, state: 'active' })
    // Access WORKS: user01 is now a real member (verified independently).
    expect((await members()).includes(USER.toLowerCase())).toBe(true)
    const row1 = (await pool.query('SELECT state, provisioned FROM pam.jit_entitlements WHERE id=$1', [id])).rows[0]
    expect(row1.state).toBe('active'); expect(row1.provisioned).toBe(true)

    const rev = await revokeJit(id, 'test', pool)
    expect(rev).toMatchObject({ ok: true, state: 'revoked' })
    // Access NO LONGER works: user01 removed from the group (verified).
    expect((await members()).includes(USER.toLowerCase())).toBe(false)
    const row2 = (await pool.query('SELECT state, revoked, revoke_status FROM pam.jit_entitlements WHERE id=$1', [id])).rows[0]
    expect(row2.state).toBe('revoked'); expect(row2.revoked).toBe(true); expect(row2.revoke_status).toBe('revoked')
  })

  it('the scheduler sweep revokes an expired entitlement (confirmed removed)', async () => {
    const id = await requestJit({ entitlementType: 'ldap-group', target: GROUP, principal: 'user01', config: LCFG, ttlSeconds: 300, requestedBy: 'alice' }, pool)
    await provisionJit(id, pool)
    expect((await members()).includes(USER.toLowerCase())).toBe(true)
    // Expire it in the past, then sweep.
    await pool.query("UPDATE pam.jit_entitlements SET expires_at=$2 WHERE id=$1", [id, new Date(Date.now() - 1000).toISOString()])
    const n = await sweepDueJit(pool)
    expect(n).toBeGreaterThanOrEqual(1)
    expect((await members()).includes(USER.toLowerCase())).toBe(false)
    expect((await pool.query('SELECT state FROM pam.jit_entitlements WHERE id=$1', [id])).rows[0].state).toBe('revoked')
  })

  it('an EXTERNALLY CONSTRAINED provider fails loudly (never fakes success)', async () => {
    const id = await requestJit({ entitlementType: 'aws_role', target: 'arn:aws:iam::x', principal: 'svc', config: {}, ttlSeconds: 300 }, pool)
    const prov = await provisionJit(id, pool)
    expect(prov.ok).toBe(false)
    expect(prov.state).toBe('provision_failed')
  })
})
