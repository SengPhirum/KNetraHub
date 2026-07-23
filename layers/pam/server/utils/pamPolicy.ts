/**
 * Deterministic policy evaluators — the authorization layers that sit BEYOND
 * the KNetraHub app tier and safe membership: time windows, source-network
 * restrictions, approval-policy satisfaction, self-approval, and
 * separation-of-duties. All pure functions (no DB, no I/O) so they are fully
 * unit-tested; the DB-backed pieces (safe membership, ticket validation) call
 * these after loading state.
 */

export interface TimeWindow {
  /** ISO weekday numbers allowed (1=Mon … 7=Sun). Empty/absent = any day. */
  days?: number[]
  /** "HH:MM" 24h start (inclusive) and end (exclusive), evaluated in UTC. */
  start?: string
  end?: string
}

function toMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]); const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

/** Is `at` within the allowed time window? An absent/empty window allows all. */
export function isWithinTimeWindow(at: Date, win?: TimeWindow | null): boolean {
  if (!win || (!win.days?.length && !win.start && !win.end)) return true
  const isoDay = ((at.getUTCDay() + 6) % 7) + 1 // JS 0=Sun → ISO 1=Mon..7=Sun
  if (win.days?.length && !win.days.includes(isoDay)) return false
  const start = toMinutes(win.start)
  const end = toMinutes(win.end)
  if (start === null && end === null) return true
  const cur = at.getUTCHours() * 60 + at.getUTCMinutes()
  const lo = start ?? 0
  const hi = end ?? 24 * 60
  // Support windows that wrap past midnight (start > end).
  return lo <= hi ? cur >= lo && cur < hi : cur >= lo || cur < hi
}

// ── Source-network restriction (IPv4 CIDR / exact; IPv6 exact) ────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

/** True if `ip` is inside `cidr` (IPv4 CIDR, IPv4/IPv6 exact match). */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false
  if (!cidr.includes('/')) return ip.trim() === cidr.trim()
  const [net, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  const ipInt = ipv4ToInt(ip)
  const netInt = ipv4ToInt(net!)
  if (ipInt === null || netInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  if (bits === 0) return true
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0
  return (ipInt & mask) === (netInt & mask)
}

/** Empty/absent allowlist = no restriction. Otherwise the IP must match one entry. */
export function sourceNetworkAllowed(ip: string | null | undefined, allowed?: string[] | null): boolean {
  if (!allowed || !allowed.length) return true
  if (!ip) return false
  return allowed.some((c) => ipInCidr(ip, c))
}

// ── Approval-policy evaluation ────────────────────────────────────────────────

export type ApprovalType =
  | 'none' | 'one' | 'any_of_group' | 'all_selected' | 'sequential' | 'parallel'
  | 'multi_level' | 'asset_owner' | 'safe_owner' | 'manager' | 'security'
  | 'risk_based' | 'ticket_only' | 'approval_and_ticket'

export interface ApprovalRecord {
  level: number
  decision: 'pending' | 'approved' | 'rejected' | 'delegated' | 'expired'
}

export interface ApprovalOutcome {
  satisfied: boolean
  rejected: boolean
  /** The lowest level still awaiting decisions (null if none pending). */
  pendingLevel: number | null
}

/**
 * Evaluate whether a set of approval records satisfies a policy. Rejection by
 * any required approver fails the request. For sequential/multi-level, every
 * level must be satisfied in order; for parallel/one/any, the quorum logic is
 * applied per level (quorum defaulted to "all present at that level" unless a
 * single approval suffices for `one`/`any_of_group`).
 */
export function evaluateApprovals(
  type: ApprovalType,
  approvals: ApprovalRecord[],
  opts: { quorumByLevel?: Record<number, number> } = {}
): ApprovalOutcome {
  if (type === 'none' || type === 'ticket_only') {
    return { satisfied: true, rejected: false, pendingLevel: null }
  }
  if (approvals.some((a) => a.decision === 'rejected')) {
    return { satisfied: false, rejected: true, pendingLevel: null }
  }
  if (!approvals.length) return { satisfied: false, rejected: false, pendingLevel: 1 }

  const levels = [...new Set(approvals.map((a) => a.level))].sort((a, b) => a - b)
  const singleApprovalTypes: ApprovalType[] = ['one', 'any_of_group', 'manager', 'security', 'asset_owner', 'safe_owner', 'risk_based']

  for (const level of levels) {
    const atLevel = approvals.filter((a) => a.level === level)
    const approved = atLevel.filter((a) => a.decision === 'approved').length
    const quorum = opts.quorumByLevel?.[level]
      ?? (singleApprovalTypes.includes(type) ? 1 : atLevel.length)
    if (approved < quorum) {
      return { satisfied: false, rejected: false, pendingLevel: level }
    }
  }
  return { satisfied: true, rejected: false, pendingLevel: null }
}

/**
 * Self-approval guard. The requester must not approve their own request unless
 * an emergency policy explicitly permits it. Returns true if the approval is
 * ALLOWED.
 */
export function selfApprovalAllowed(requester: string, approver: string, allowSelf: boolean): boolean {
  if (requester.trim().toLowerCase() !== approver.trim().toLowerCase()) return true
  return allowSelf === true
}

/**
 * Separation-of-duties: an approver may not approve if they belong to any
 * conflicting group relative to the requester. `conflicts` is a list of group
 * pairs that may not be shared between requester and approver.
 */
export function separationOfDutiesViolation(
  requesterGroups: string[],
  approverGroups: string[],
  conflicts: [string, string][]
): boolean {
  const rq = new Set(requesterGroups.map((g) => g.toLowerCase()))
  const ap = new Set(approverGroups.map((g) => g.toLowerCase()))
  for (const [a, b] of conflicts) {
    const la = a.toLowerCase(); const lb = b.toLowerCase()
    if ((rq.has(la) && ap.has(lb)) || (rq.has(lb) && ap.has(la))) return true
  }
  return false
}

// ── Safe permissions vocabulary ──────────────────────────────────────────────

/** Granular per-safe permissions a member can be granted (spec §4.2). */
export const SAFE_PERMISSIONS = [
  'list_accounts', 'view_metadata', 'use_account', 'reveal_credential', 'add_account',
  'update_account', 'delete_account', 'initiate_rotation', 'initiate_verification',
  'initiate_reconciliation', 'approve_access', 'view_audit', 'view_recordings',
  'export_recordings', 'manage_members', 'manage_safe', 'recover_objects'
] as const
export type SafePermission = typeof SAFE_PERMISSIONS[number]

/** The default permission set granted to a new safe member at a given role preset. */
export function defaultSafePermissions(preset: 'reader' | 'user' | 'approver' | 'owner'): SafePermission[] {
  switch (preset) {
    case 'reader': return ['list_accounts', 'view_metadata']
    case 'user': return ['list_accounts', 'view_metadata', 'use_account', 'initiate_verification']
    case 'approver': return ['list_accounts', 'view_metadata', 'approve_access', 'view_audit', 'view_recordings']
    case 'owner': return [...SAFE_PERMISSIONS]
  }
}
