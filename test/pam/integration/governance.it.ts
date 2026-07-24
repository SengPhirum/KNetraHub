import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import {
  resolveRequestPolicy, evaluateRequest, finalizeIfApproved, quorumByLevel,
  hasDecidedAtLevel, assertApproverEligible, assertNoSodConflict
} from '../../../layers/pam/server/utils/pamRequests'
import { selfApprovalAllowed } from '../../../layers/pam/server/utils/pamPolicy'
import { createPolicy, updatePolicy, getPolicy, deletePolicy, listPolicyVersions } from '../../../layers/pam/server/utils/pamPolicyStore'
import { scanZsp } from '../../../layers/pam/server/utils/pamZsp'

/**
 * Proves the approval-governance enforcement that was modeled but never wired:
 * per-level QUORUM (a quorum≥2 level needs 2 distinct approvers), distinct-
 * approver, self-approval block, approver eligibility, and separation-of-duties.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const now = () => new Date().toISOString()

async function setupPolicy(opts: { quorum?: number; sod?: unknown; allowSelf?: boolean; approverType?: string; owner?: string } = {}): Promise<{ policyId: string; safeId: string; accountId: string }> {
  const policyId = nanoid(), safeId = nanoid(), accountId = nanoid()
  await pool.query("INSERT INTO pam.access_policies (id,name,approval_type,allow_self_approval,max_duration_minutes,separation_of_duties,enabled,created_at) VALUES ($1,'Gov',$2,$3,240,$4,true,$5)",
    [policyId, 'multi_level', !!opts.allowSelf, opts.sod ? JSON.stringify(opts.sod) : null, now()])
  await pool.query("INSERT INTO pam.access_policy_rules (id,policy_id,level,approver_type,quorum,ordering) VALUES ($1,$2,1,$3,$4,0)",
    [nanoid(), policyId, opts.approverType || 'manager', opts.quorum || 1])
  await pool.query("INSERT INTO pam.safes (id,name,slug,approval_policy_id,created_at) VALUES ($1,'GovSafe',$2,$3,$4)", [safeId, `gov-${safeId}`, policyId, now()])
  await pool.query("INSERT INTO pam.accounts (id,name,username,safe_id,account_type,owner,created_at) VALUES ($1,'root@t','root',$2,'generic',$3,$4)", [accountId, safeId, opts.owner || 'bob', now()])
  return { policyId, safeId, accountId }
}

async function createRequest(accountId: string, quorum: number, requester = 'alice'): Promise<string> {
  const reqId = nanoid()
  await pool.query("INSERT INTO pam.access_requests (id,requester,requester_id,action,reason,status,created_at) VALUES ($1,$2,$2,'connect','integration test','pending',$3)", [reqId, requester, now()])
  await pool.query('INSERT INTO pam.request_accounts (request_id,account_id) VALUES ($1,$2)', [reqId, accountId])
  for (let i = 0; i < quorum; i++) {
    await pool.query("INSERT INTO pam.request_approvals (id,request_id,level,approver_type,decision,created_at) VALUES ($1,$2,1,'manager','pending',$3)", [nanoid(), reqId, now()])
  }
  return reqId
}

async function approveSlot(reqId: string, approver: string) {
  const slot = (await pool.query("SELECT id FROM pam.request_approvals WHERE request_id=$1 AND decision='pending' ORDER BY created_at LIMIT 1", [reqId])).rows[0]
  await pool.query("UPDATE pam.request_approvals SET decision='approved', approver=$2, decided_at=$3 WHERE id=$1", [slot.id, approver, now()])
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('approval quorum enforcement', () => {
  it('a quorum-2 level needs TWO distinct approvals before it is satisfied', async () => {
    const { accountId } = await setupPolicy({ quorum: 2 })
    const policy = await resolveRequestPolicy([accountId], pool)
    expect(quorumByLevel(policy)[1]).toBe(2)
    const reqId = await createRequest(accountId, 2)

    expect((await evaluateRequest(reqId, policy, pool)).satisfied).toBe(false)
    await approveSlot(reqId, 'mgr1')
    expect(await hasDecidedAtLevel(reqId, 1, 'mgr1', pool)).toBe(true)
    expect(await finalizeIfApproved(reqId, policy, 'mgr1', pool)).toBe('pending') // 1 of 2

    await approveSlot(reqId, 'mgr2')
    expect(await finalizeIfApproved(reqId, policy, 'mgr2', pool)).toBe('approved') // 2 of 2
    // Grants issued on approval.
    const grants = (await pool.query("SELECT count(*)::int c FROM pam.access_grants WHERE request_id=$1 AND status='active'", [reqId])).rows[0].c
    expect(grants).toBeGreaterThanOrEqual(1)
  })
})

describe('self-approval + distinct approver', () => {
  it('blocks self-approval unless allowed; the same person cannot fill two slots', async () => {
    expect(selfApprovalAllowed('alice', 'alice', false)).toBe(false)
    expect(selfApprovalAllowed('alice', 'alice', true)).toBe(true)
    expect(selfApprovalAllowed('alice', 'mgr1', false)).toBe(true)
    const { accountId } = await setupPolicy({ quorum: 2 })
    const reqId = await createRequest(accountId, 2)
    await approveSlot(reqId, 'mgr1')
    expect(await hasDecidedAtLevel(reqId, 1, 'mgr1', pool)).toBe(true)  // mgr1 already decided this level
    expect(await hasDecidedAtLevel(reqId, 1, 'mgr2', pool)).toBe(false) // mgr2 has not
  })
})

describe('zero-standing-privilege scan', () => {
  it('flags a standing (unmanaged, non-rotating) privileged account', async () => {
    const safeId = nanoid(), accountId = nanoid()
    await pool.query("INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,'ZSP',$2,$3)", [safeId, `zsp-${safeId}`, now()])
    await pool.query("INSERT INTO pam.accounts (id,name,username,safe_id,account_type,criticality,privilege_level,auto_managed,created_at) VALUES ($1,'root@crit','root',$2,'linux','critical','root',false,$3)", [accountId, safeId, now()])
    const res = await scanZsp(pool, { record: false })
    const finding = res.findings.find((f) => f.kind === 'standing_privileged_account' && f.accountId === accountId)
    expect(finding).toBeTruthy()
    expect(finding!.severity).toBe('critical')
  })
})

describe('policy CRUD + versioning', () => {
  it('creates, edits (bumping version), snapshots versions, and deletes a policy', async () => {
    const id = await createPolicy({
      name: 'Prod SSH', approvalType: 'multi_level', requireTicket: true, maxDurationMinutes: 120,
      levels: [{ level: 1, approverType: 'manager', quorum: 2 }, { level: 2, approverType: 'security', quorum: 1 }], actor: 'admin'
    }, pool)
    let p = await getPolicy(id, pool)
    expect(p.version).toBe(1)
    expect(p.rules.length).toBe(2)
    expect(p.rules.find((r: any) => r.level === 1).quorum).toBe(2)

    await updatePolicy(id, { name: 'Prod SSH v2', maxDurationMinutes: 60, levels: [{ level: 1, approverType: 'manager', quorum: 1 }], actor: 'admin' }, pool)
    p = await getPolicy(id, pool)
    expect(p.version).toBe(2)
    expect(p.name).toBe('Prod SSH v2')
    expect(p.rules.length).toBe(1)

    const versions = await listPolicyVersions(id, pool)
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2])

    await deletePolicy(id, pool)
    expect(await getPolicy(id, pool)).toBeNull()
  })
})

describe('approver eligibility + separation of duties', () => {
  it('asset_owner level requires the account owner; non-owner is rejected', async () => {
    const { accountId } = await setupPolicy({ approverType: 'asset_owner', owner: 'bob' })
    await expect(assertApproverEligible({ username: 'alice', id: 'alice' }, 'admin', { approverType: 'asset_owner', approverRef: null }, [accountId], pool)).rejects.toBeTruthy()
    await expect(assertApproverEligible({ username: 'bob', id: 'bob' }, 'admin', { approverType: 'asset_owner', approverRef: null }, [accountId], pool)).resolves.toBeUndefined()
  })

  it('SoD ownerCannotApprove blocks an owner from approving their own asset', async () => {
    const { accountId } = await setupPolicy({ sod: { ownerCannotApprove: true }, owner: 'bob' })
    const policy = await resolveRequestPolicy([accountId], pool)
    await expect(assertNoSodConflict(policy, { requester: 'alice' }, { username: 'bob', id: 'bob' }, [accountId], pool)).rejects.toBeTruthy()
    await expect(assertNoSodConflict(policy, { requester: 'alice' }, { username: 'carol', id: 'carol' }, [accountId], pool)).resolves.toBeUndefined()
  })
})
