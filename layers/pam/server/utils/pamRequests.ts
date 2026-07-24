import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso, getPamSetting } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { evaluateApprovals, separationOfDutiesViolation, type ApprovalType, type ApprovalRecord } from './pamPolicy'
import { resolveSafePermissions } from './pamStore'

/**
 * Access-request lifecycle helpers: resolve the applicable approval policy,
 * evaluate whether approvals are satisfied, and issue time-bound grants when a
 * request is approved. Grants are the objects sessions and reveals check.
 */

export interface PolicyResolution {
  policyId: string | null
  approvalType: ApprovalType
  requireTicket: boolean
  requireMfa: boolean
  requireRecording: boolean
  allowSelfApproval: boolean
  maxDurationMinutes: number
  maxConcurrentSessions: number
  separationOfDuties: unknown
  levels: Array<{ level: number; approverType: string; approverRef: string | null; quorum: number }>
}

const DEFAULT_POLICY: PolicyResolution = {
  policyId: null, approvalType: 'one', requireTicket: false, requireMfa: false, requireRecording: true,
  allowSelfApproval: false, maxDurationMinutes: 240, maxConcurrentSessions: 1, separationOfDuties: null,
  levels: [{ level: 1, approverType: 'manager', approverRef: null, quorum: 1 }]
}

function parseJson(raw: unknown): any { if (!raw) return null; try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return null } }

/** Quorum required per approval level (defaults to 1). */
export function quorumByLevel(policy: PolicyResolution): Record<number, number> {
  const out: Record<number, number> = {}
  for (const l of policy.levels) out[l.level] = Math.max(1, Number(l.quorum) || 1)
  return out
}

/** Resolve the approval policy for a request from the safes of its accounts. */
export async function resolveRequestPolicy(accountIds: string[], db: Pool = getPamDb()): Promise<PolicyResolution> {
  if (!accountIds.length) return DEFAULT_POLICY
  const { rows: safes } = await db.query(
    `SELECT DISTINCT s.approval_policy_id
       FROM pam.accounts a JOIN pam.safes s ON s.id = a.safe_id
      WHERE a.id = ANY($1::text[]) AND s.approval_policy_id IS NOT NULL`,
    [accountIds]
  )
  const policyId = safes[0]?.approval_policy_id ?? null
  if (!policyId) return DEFAULT_POLICY

  const { rows } = await db.query('SELECT * FROM pam.access_policies WHERE id=$1 AND enabled=true', [policyId])
  if (!rows.length) return DEFAULT_POLICY
  const p = rows[0]
  const { rows: ruleRows } = await db.query('SELECT * FROM pam.access_policy_rules WHERE policy_id=$1 ORDER BY level, ordering', [policyId])
  return {
    policyId,
    approvalType: p.approval_type,
    requireTicket: p.require_ticket,
    requireMfa: p.require_mfa,
    requireRecording: p.require_recording,
    allowSelfApproval: p.allow_self_approval,
    maxDurationMinutes: Number(p.max_duration_minutes) || 240,
    maxConcurrentSessions: Number(p.max_concurrent_sessions) || 1,
    separationOfDuties: parseJson(p.separation_of_duties),
    levels: ruleRows.length
      ? ruleRows.map((r) => ({ level: Number(r.level), approverType: r.approver_type, approverRef: r.approver_ref, quorum: Number(r.quorum) || 1 }))
      : DEFAULT_POLICY.levels
  }
}

/** Evaluate the request's approvals against its policy — enforcing per-level quorum. */
export async function evaluateRequest(requestId: string, policy: PolicyResolution, db: Pool = getPamDb()) {
  const { rows } = await db.query('SELECT level, decision FROM pam.request_approvals WHERE request_id=$1', [requestId])
  return evaluateApprovals(policy.approvalType, rows as ApprovalRecord[], { quorumByLevel: quorumByLevel(policy) })
}

/** The lowest approval level that still has pending slots (sequential gate). */
export async function currentPendingLevel(requestId: string, db: Pool = getPamDb()): Promise<number | null> {
  const { rows } = await db.query("SELECT MIN(level) AS lvl FROM pam.request_approvals WHERE request_id=$1 AND decision='pending'", [requestId])
  return rows[0]?.lvl != null ? Number(rows[0].lvl) : null
}

/** An approver may fill at most ONE slot per level (distinct-approver quorum). */
export async function hasDecidedAtLevel(requestId: string, level: number, approver: string, db: Pool = getPamDb()): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM pam.request_approvals WHERE request_id=$1 AND level=$2 AND lower(approver)=lower($3) LIMIT 1", [requestId, level, approver])
  return rows.length > 0
}

/**
 * Verify the approver is eligible for a level's approver type. `manager`/
 * `security`/`any` are satisfied by the pam.request.approve permission (already
 * required). `asset_owner`/`safe_owner`/`group` require ownership/membership.
 */
export async function assertApproverEligible(user: any, tier: string, level: { approverType: string; approverRef: string | null }, accountIds: string[], db: Pool = getPamDb()): Promise<void> {
  const type = (level.approverType || 'manager').toLowerCase()
  if (['manager', 'security', 'any', 'one', 'any_of_group', 'multi_level', 'sequential', 'parallel'].includes(type)) return
  if (type === 'asset_owner') {
    const owners = (await db.query('SELECT DISTINCT lower(owner) AS o FROM pam.accounts WHERE id = ANY($1::text[])', [accountIds])).rows.map((r) => r.o).filter(Boolean)
    if (!owners.includes(user.username.toLowerCase())) throw createError({ statusCode: 403, statusMessage: 'This level requires the asset owner to approve' })
    return
  }
  if (type === 'safe_owner' || type === 'group') {
    const safes = (await db.query('SELECT DISTINCT safe_id FROM pam.accounts WHERE id = ANY($1::text[])', [accountIds])).rows.map((r) => r.safe_id)
    for (const s of safes) {
      const perms = await resolveSafePermissions(user, tier, s)
      if (!perms.has('manage_safe') && !perms.has('approve_access')) {
        throw createError({ statusCode: 403, statusMessage: `This level requires ${type === 'group' ? 'a designated approver group' : 'a safe owner'} to approve` })
      }
    }
  }
}

/** Separation-of-duties: block conflicted approvers. Supports a boolean
 * "owner-cannot-approve" rule and a group-conflict list (when groups known). */
export async function assertNoSodConflict(policy: PolicyResolution, request: any, user: any, accountIds: string[], db: Pool = getPamDb()): Promise<void> {
  const sod = policy.separationOfDuties
  if (!sod) return
  // Boolean / owner rule: an account owner may not approve access to their own asset.
  if (sod === true || (sod as any).ownerCannotApprove) {
    const owners = (await db.query('SELECT DISTINCT lower(owner) AS o FROM pam.accounts WHERE id = ANY($1::text[])', [accountIds])).rows.map((r) => r.o).filter(Boolean)
    if (owners.includes(user.username.toLowerCase())) throw createError({ statusCode: 403, statusMessage: 'Separation of duties: the asset owner may not approve access to their own account' })
  }
  // Group-conflict list (requester vs approver group memberships).
  const conflicts: [string, string][] = Array.isArray((sod as any).conflicts) ? (sod as any).conflicts : []
  if (conflicts.length) {
    const groups = (u: any) => Array.isArray(u?.groups) ? u.groups : (typeof u?.realm_roles === 'string' ? safeArr(u.realm_roles) : [])
    const reqUser = (await db.query('SELECT realm_roles FROM users WHERE lower(username)=lower($1)', [request.requester])).rows[0]
    if (separationOfDutiesViolation(groups(reqUser) as string[], groups(user) as string[], conflicts)) {
      throw createError({ statusCode: 403, statusMessage: 'Separation of duties: your group conflicts with the requester\'s' })
    }
  }
}

function safeArr(raw: string): string[] { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] } }

/** Issue a grant per account for an approved request. Returns grant ids. */
export async function issueGrants(requestId: string, db: Pool = getPamDb()): Promise<string[]> {
  const { rows: reqRows } = await db.query('SELECT * FROM pam.access_requests WHERE id=$1', [requestId])
  if (!reqRows.length) return []
  const req = reqRows[0]
  const { rows: accts } = await db.query('SELECT account_id FROM pam.request_accounts WHERE request_id=$1', [requestId])
  const maxMinutes = await policyMaxMinutes(req, db)
  const startsAt = req.start_at || nowIso()
  const expiresAt = req.expiry_at || new Date(Date.parse(startsAt) + maxMinutes * 60_000).toISOString()
  const ids: string[] = []
  for (const a of accts) {
    const id = newId()
    await db.query(
      `INSERT INTO pam.access_grants
        (id, request_id, account_id, grantee, grantee_id, action, protocol, source_network,
         starts_at, expires_at, max_concurrent_sessions, emergency, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13)`,
      [id, requestId, a.account_id, req.requester, req.requester_id, req.action, req.protocol,
        req.source_network, startsAt, expiresAt, 1, req.emergency === true, nowIso()]
    )
    ids.push(id)
  }
  return ids
}

async function policyMaxMinutes(req: any, db: Pool): Promise<number> {
  if (req.max_duration_minutes) return Number(req.max_duration_minutes)
  return getPamSetting<number>('session.max_duration_minutes', 240, db)
}

/** Called after each approval decision — if satisfied, approve + issue grants + notify. */
export async function finalizeIfApproved(requestId: string, policy: PolicyResolution, actor: string, db: Pool = getPamDb()): Promise<'approved' | 'pending' | 'rejected'> {
  const outcome = await evaluateRequest(requestId, policy, db)
  if (outcome.rejected) return 'rejected'
  if (!outcome.satisfied) {
    if (outcome.pendingLevel) await db.query('UPDATE pam.access_requests SET current_level=$2, updated_at=$3 WHERE id=$1', [requestId, outcome.pendingLevel, nowIso()])
    return 'pending'
  }
  await db.query("UPDATE pam.access_requests SET status='approved', decided_at=$2, updated_at=$2 WHERE id=$1", [requestId, nowIso()])
  const grants = await issueGrants(requestId, db)
  await appendAudit({ actor, action: 'request.approved', objectType: 'request', objectId: requestId, result: 'success', severity: 'notice', details: { grants: grants.length } }, db).catch(() => {})
  const { rows } = await db.query('SELECT requester FROM pam.access_requests WHERE id=$1', [requestId])
  await pamNotify({ severity: 'info', event: 'request.approved', title: 'Access request approved', body: `Request ${requestId.slice(0, 8)} approved; ${grants.length} grant(s) issued.`, objectType: 'request', objectId: requestId, link: `/pam/requests/${requestId}` }, db).catch(() => {})
  return 'approved'
}
