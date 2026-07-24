/**
 * Stage 8 — pure, deterministic risk evaluators (spec §12).
 *
 * These operate ONLY on already-fetched rows + parsed config, so every rule is
 * unit-testable without a database and produces the same event for the same
 * input. The DB wrapper (`pamRiskEngine.ts`) fetches the event sources, feeds
 * them here, and persists the returned candidates idempotently via `dedupe_key`.
 *
 * No random scoring: each candidate carries a stable dedupe key, an
 * explanation, and evidence. Severity defaults come from the rule registry.
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface RiskCandidate {
  ruleKey: string
  severity?: Severity
  confidence?: number
  actor?: string | null
  accountId?: string | null
  target?: string | null
  sessionId?: string | null
  requestId?: string | null
  evidence?: unknown
  explanation?: string
  recommendedAction?: string
  /** Stable key → one event per (rule, subject, bucket); NULL-safe unique index. */
  dedupeKey: string
}

export interface BusinessHours {
  days: number[]           // allowed weekdays, 0=Sun … 6=Sat (JS getUTCDay)
  start: string            // 'HH:MM'
  end: string              // 'HH:MM'
  tzOffsetMinutes?: number // wall-clock offset from UTC (default 0)
}

const clampTime = (s: string, fallback: number): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''))
  if (!m) return fallback
  return Number(m[1]) * 60 + Number(m[2])
}

/** Is an ISO timestamp outside configured business hours? Pure + deterministic. */
export function isOffHours(iso: string, bh: BusinessHours): { off: boolean; reason: string } {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { off: false, reason: 'invalid timestamp' }
  const shifted = new Date(d.getTime() + (bh.tzOffsetMinutes ?? 0) * 60_000)
  const day = shifted.getUTCDay()
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  const startMin = clampTime(bh.start, 7 * 60)
  const endMin = clampTime(bh.end, 19 * 60)
  const days = Array.isArray(bh.days) && bh.days.length ? bh.days : [1, 2, 3, 4, 5]
  if (!days.includes(day)) return { off: true, reason: `non-business day (weekday ${day})` }
  if (minutes < startMin || minutes >= endMin) return { off: true, reason: `outside ${bh.start}–${bh.end}` }
  return { off: false, reason: 'within business hours' }
}

export function parseAutoResponse(raw: string | null | undefined, fallback: string[] = []): string[] {
  if (raw == null || raw === '') return fallback
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String).filter(Boolean) : fallback
  } catch { return fallback }
}

export function parseConfig(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

export function threshold(config: Record<string, any>, key: string, def: number): number {
  const v = Number(config?.[key])
  return Number.isFinite(v) && v > 0 ? v : def
}

// ── Row shapes (subset of the real columns each evaluator needs) ───────────────
export interface SessionRow { id: string; principal: string; account_id?: string | null; target?: string | null; source_ip?: string | null; started_at: string; recording_required?: boolean; recording_status?: string }
export interface CountRow { key: string; count: number }
export interface AccountRow { id: string; name?: string | null; auto_managed?: boolean; rotation_status?: string; next_rotation_at?: string | null }
export interface VendorUserRow { id: string; email?: string | null; vendor_id: string; vendor_name?: string | null; vu_status: string; vendor_status: string; contract_end?: string | null }

// ── Evaluators ─────────────────────────────────────────────────────────────────

/** Privileged sessions that STARTED outside business hours (one event / session). */
export function evalOffHours(sessions: SessionRow[], bh: BusinessHours): RiskCandidate[] {
  const out: RiskCandidate[] = []
  for (const s of sessions) {
    const v = isOffHours(s.started_at, bh)
    if (!v.off) continue
    out.push({
      ruleKey: 'access_off_hours', actor: s.principal, accountId: s.account_id ?? null, target: s.target ?? null,
      sessionId: s.id, evidence: { startedAt: s.started_at, reason: v.reason },
      explanation: `${s.principal} started a privileged session ${v.reason}.`,
      dedupeKey: `off_hours|${s.id}`
    })
  }
  return out
}

/** The same identity active from >1 distinct source address simultaneously. */
export function evalConcurrentSources(active: SessionRow[], bucket: string): RiskCandidate[] {
  const byUser = new Map<string, Set<string>>()
  for (const s of active) {
    if (!s.source_ip) continue
    if (!byUser.has(s.principal)) byUser.set(s.principal, new Set())
    byUser.get(s.principal)!.add(s.source_ip)
  }
  const out: RiskCandidate[] = []
  for (const [principal, ips] of byUser) {
    if (ips.size < 2) continue
    out.push({
      ruleKey: 'concurrent_sources', actor: principal, evidence: { sources: [...ips] },
      explanation: `${principal} has concurrent privileged sessions from ${ips.size} source addresses (${[...ips].join(', ')}).`,
      dedupeKey: `concurrent|${principal}|${bucket}`
    })
  }
  return out
}

/** First-ever access from a source address for this identity. `seen` = principal|ip observed before the window. */
export function evalNewSourceIp(recent: SessionRow[], seen: Set<string>): RiskCandidate[] {
  const out: RiskCandidate[] = []
  const localSeen = new Set(seen)
  for (const s of recent) {
    if (!s.source_ip) continue
    const key = `${s.principal}|${s.source_ip}`
    if (localSeen.has(key)) continue
    localSeen.add(key)
    out.push({
      ruleKey: 'new_source_ip', actor: s.principal, sessionId: s.id, evidence: { sourceIp: s.source_ip },
      explanation: `${s.principal} accessed from a new source address ${s.source_ip}.`,
      dedupeKey: `new_ip|${s.principal}|${s.source_ip}`
    })
  }
  return out
}

/** First access to a CRITICAL target. `priorAccess` = principal|account_id seen before the window. */
export function evalFirstCriticalAccess(recentCritical: SessionRow[], priorAccess: Set<string>): RiskCandidate[] {
  const out: RiskCandidate[] = []
  const seen = new Set(priorAccess)
  for (const s of recentCritical) {
    if (!s.account_id) continue
    const key = `${s.principal}|${s.account_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      ruleKey: 'first_critical_access', actor: s.principal, accountId: s.account_id, target: s.target ?? null, sessionId: s.id,
      explanation: `${s.principal} accessed critical target ${s.target ?? s.account_id} for the first time.`,
      dedupeKey: `first_crit|${s.principal}|${s.account_id}`
    })
  }
  return out
}

/** Actors with ≥ threshold failed access events in the window. `counts.key` = actor. */
export function evalRepeatedFailedAccess(counts: CountRow[], thresholdN: number, bucket: string): RiskCandidate[] {
  return counts.filter((c) => c.count >= thresholdN).map((c) => ({
    ruleKey: 'repeated_failed_access', actor: c.key, evidence: { failures: c.count, window: bucket },
    explanation: `${c.key} had ${c.count} failed privileged-access attempts.`,
    dedupeKey: `failed|${c.key}|${bucket}`
  }))
}

/** Requesters with ≥ threshold rejected requests in the window. `counts.key` = requester. */
export function evalRepeatedRejection(counts: CountRow[], thresholdN: number, bucket: string): RiskCandidate[] {
  return counts.filter((c) => c.count >= thresholdN).map((c) => ({
    ruleKey: 'repeated_rejection', actor: c.key, evidence: { rejections: c.count, window: bucket },
    explanation: `${c.key} has ${c.count} rejected access requests but keeps requesting.`,
    dedupeKey: `rejection|${c.key}|${bucket}`
  }))
}

/** Auto-managed accounts overdue for rotation, or whose last rotation failed. */
export function evalRotationOverdue(accounts: AccountRow[], cutoffIso: string, dayBucket: string): RiskCandidate[] {
  const out: RiskCandidate[] = []
  for (const a of accounts) {
    const overdue = a.auto_managed && a.next_rotation_at != null && a.next_rotation_at < cutoffIso
    const failed = a.rotation_status === 'failed'
    if (!overdue && !failed) continue
    out.push({
      ruleKey: 'rotation_overdue', accountId: a.id, target: a.name ?? null,
      evidence: { rotationStatus: a.rotation_status, nextRotationAt: a.next_rotation_at ?? null, failed },
      explanation: failed
        ? `Rotation for ${a.name ?? a.id} is in a failed state.`
        : `Rotation for ${a.name ?? a.id} is overdue (due ${a.next_rotation_at}).`,
      dedupeKey: `rotation_overdue|${a.id}|${dayBucket}`
    })
  }
  return out
}

/** Ended sessions that required recording but produced none. */
export function evalSessionWithoutRecording(ended: SessionRow[]): RiskCandidate[] {
  const out: RiskCandidate[] = []
  for (const s of ended) {
    if (!s.recording_required) continue
    if (s.recording_status === 'stored' || s.recording_status === 'disabled') continue
    out.push({
      ruleKey: 'session_without_recording', actor: s.principal, target: s.target ?? null, sessionId: s.id,
      evidence: { recordingStatus: s.recording_status ?? null },
      explanation: `Session by ${s.principal} required recording but ended with status "${s.recording_status ?? 'none'}".`,
      dedupeKey: `no_recording|${s.id}`
    })
  }
  return out
}

/** Active vendor users whose org is suspended/expired or whose contract has ended. */
export function evalVendorOutOfWindow(rows: VendorUserRow[], nowIso: string, dayBucket: string): RiskCandidate[] {
  const out: RiskCandidate[] = []
  for (const v of rows) {
    const expired = v.contract_end != null && v.contract_end < nowIso
    const orgBad = v.vendor_status !== 'active'
    if (!expired && !orgBad) continue
    out.push({
      ruleKey: 'vendor_out_of_window', actor: v.email ?? v.id, target: v.vendor_name ?? v.vendor_id,
      evidence: { vendorStatus: v.vendor_status, contractEnd: v.contract_end ?? null, expired, orgBad },
      explanation: expired
        ? `Vendor ${v.email ?? v.id} remains active though the contract ended ${v.contract_end}.`
        : `Vendor ${v.email ?? v.id} is active while the sponsoring org is ${v.vendor_status}.`,
      dedupeKey: `vendor_oow|${v.id}|${dayBucket}`
    })
  }
  return out
}
