/**
 * Stage 8 — pure logic for access-certification campaigns (spec §11).
 * Tallying and status derivation are deterministic and DB-free so they can be
 * unit-tested; the DB wrapper (`pamCertification.ts`) fetches subjects and
 * persists decisions, executing a REAL revoke when an item is revoked.
 */

export type CertDecision = 'pending' | 'certified' | 'revoked' | 'delegated'
export type CampaignStatus = 'open' | 'in_progress' | 'completed' | 'overdue'

export interface CampaignCounts {
  total: number; pending: number; certified: number; revoked: number; delegated: number
}

export function tallyItems(items: { decision: string }[]): CampaignCounts {
  const c: CampaignCounts = { total: items.length, pending: 0, certified: 0, revoked: 0, delegated: 0 }
  for (const it of items) {
    if (it.decision === 'certified') c.certified++
    else if (it.decision === 'revoked') c.revoked++
    else if (it.decision === 'delegated') c.delegated++
    else c.pending++
  }
  return c
}

/**
 * open        → nothing decided yet
 * in_progress → some decided, some pending
 * completed   → every item decided (certified/revoked/delegated), or empty campaign
 * overdue     → not complete and past due date
 */
export function deriveStatus(counts: CampaignCounts, dueDate: string | null | undefined, nowIso: string): CampaignStatus {
  const decided = counts.certified + counts.revoked + counts.delegated
  const complete = counts.total > 0 && counts.pending === 0
  if (complete || counts.total === 0) return 'completed'
  if (dueDate && dueDate < nowIso) return 'overdue'
  return decided > 0 ? 'in_progress' : 'open'
}

export interface ScopeItem { subjectType: string; subjectId: string; subjectLabel: string }

export type CampaignScope =
  | { type: 'active_grants' }
  | { type: 'privileged_accounts' }
  | { type: 'jit_entitlements' }
  | { type: 'safe_members'; safeId: string }

const asStr = (v: unknown) => (v == null ? '' : String(v))

/** Build certification items from fetched source rows (pure — one shape per scope). */
export function itemsFromRows(scope: CampaignScope, rows: any[]): ScopeItem[] {
  switch (scope.type) {
    case 'active_grants':
      return rows.map((r) => ({
        subjectType: 'grant', subjectId: asStr(r.id),
        subjectLabel: `${asStr(r.grantee)} → ${asStr(r.account_name || r.account_id)} (${asStr(r.action || 'connect')})`
      }))
    case 'privileged_accounts':
      return rows.map((r) => ({
        subjectType: 'account', subjectId: asStr(r.id),
        subjectLabel: `${asStr(r.name)} [${asStr(r.criticality)}] in ${asStr(r.safe_name || r.safe_id)}`
      }))
    case 'jit_entitlements':
      return rows.map((r) => ({
        subjectType: 'jit', subjectId: asStr(r.id),
        subjectLabel: `${asStr(r.principal)} · ${asStr(r.entitlement_type)} on ${asStr(r.target)}`
      }))
    case 'safe_members':
      return rows.map((r) => ({
        subjectType: 'safe_member', subjectId: asStr(r.id),
        subjectLabel: `${asStr(r.principal || r.member)} · ${asStr(r.role || r.permissions)}`
      }))
    default:
      return []
  }
}

export function isValidDecision(d: string): d is Exclude<CertDecision, 'pending'> {
  return d === 'certified' || d === 'revoked' || d === 'delegated'
}
