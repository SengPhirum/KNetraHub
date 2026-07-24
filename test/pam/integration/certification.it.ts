import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { createCampaign, getCampaign, decideItem, listCampaigns } from '../../../layers/pam/server/utils/pamCertification'

/**
 * Proves access certification (spec §11): a campaign snapshots active grants
 * into review items; certifying keeps access; REVOKING performs the real
 * enforcement (grant revoked + live session terminated); and once every item
 * is decided the campaign completes with a stored evidence summary.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const now = () => new Date().toISOString()
const future = () => new Date(Date.now() + 86400000).toISOString()

async function grant(grantee: string): Promise<{ grantId: string; sessionId: string }> {
  const safeId = nanoid(), acctId = nanoid(), grantId = nanoid(), sessionId = nanoid()
  await pool.query("INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,$2,$3,$4)", [safeId, `Safe ${safeId}`, `s-${safeId}`, now()])
  await pool.query("INSERT INTO pam.accounts (id,name,username,safe_id,account_type,created_at) VALUES ($1,$2,'svc',$3,'generic',$4)", [acctId, `acct-${acctId}`, safeId, now()])
  await pool.query("INSERT INTO pam.access_grants (id,account_id,grantee,action,starts_at,expires_at,status,created_at) VALUES ($1,$2,$3,'connect',$4,$5,'active',$4)",
    [grantId, acctId, grantee, now(), future()])
  await pool.query("INSERT INTO pam.sessions (id,account_id,grant_id,principal,started_at,state) VALUES ($1,$2,$3,$4,$5,'active')", [sessionId, acctId, grantId, grantee, now()])
  return { grantId, sessionId }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('certification campaign over active grants', () => {
  it('certify keeps access; revoke enforces (grant revoked + session terminated); completion is recorded', async () => {
    const a = await grant('alice')
    const b = await grant('bob')

    const { id, itemCount } = await createCampaign({ name: 'Q3 Access Review', scope: { type: 'active_grants' }, reviewer: 'auditor', dueDate: future(), actor: 'admin' }, pool)
    expect(itemCount).toBe(2)

    const campaign = await getCampaign(id, pool)
    expect(campaign.status).toBe('open')
    const itemA = campaign.items.find((i: any) => i.subject_id === a.grantId)
    const itemB = campaign.items.find((i: any) => i.subject_id === b.grantId)
    expect(itemA && itemB).toBeTruthy()

    // Certify alice's grant → nothing changes.
    const d1 = await decideItem(id, itemA.id, { decision: 'certified', reviewer: 'auditor' }, pool)
    expect(d1.campaignStatus).toBe('in_progress')
    expect((await pool.query('SELECT status FROM pam.access_grants WHERE id=$1', [a.grantId])).rows[0].status).toBe('active')

    // Revoke bob's grant → real enforcement.
    const d2 = await decideItem(id, itemB.id, { decision: 'revoked', comment: 'no longer needed', reviewer: 'auditor' }, pool)
    expect(d2.enforcement).toMatch(/grant revoked/)
    expect((await pool.query('SELECT status FROM pam.access_grants WHERE id=$1', [b.grantId])).rows[0].status).toBe('revoked')
    expect((await pool.query('SELECT state FROM pam.sessions WHERE id=$1', [b.sessionId])).rows[0].state).toBe('terminated')

    // All items decided → completed with an evidence summary.
    expect(d2.campaignStatus).toBe('completed')
    const done = (await pool.query('SELECT status, completed_at, summary FROM pam.certification_campaigns WHERE id=$1', [id])).rows[0]
    expect(done.status).toBe('completed')
    expect(done.completed_at).toBeTruthy()
    expect(JSON.parse(done.summary)).toMatchObject({ total: 2, certified: 1, revoked: 1 })

    expect((await listCampaigns(pool)).find((c: any) => c.id === id)?.total).toBe(2)
  })

  it('rejects an invalid decision and an unknown item', async () => {
    const { id } = await createCampaign({ name: 'Empty-ish', scope: { type: 'privileged_accounts' }, actor: 'admin' }, pool)
    await expect(decideItem(id, 'nope', { decision: 'certified', reviewer: 'x' }, pool)).rejects.toBeTruthy()
    await expect(decideItem(id, 'nope', { decision: 'bogus', reviewer: 'x' }, pool)).rejects.toBeTruthy()
  })
})
