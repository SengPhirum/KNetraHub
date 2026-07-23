import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { pamNotify } from './pamNotify'

/**
 * Privileged threat analytics — deterministic, explainable rules (spec §4.14).
 * No random scoring, no "AI" labelling. Each event carries the rule, severity,
 * confidence, evidence and a plain-language explanation plus a recommended
 * action. The interface is pluggable so statistical/ML models can be added
 * later, but the shipped analytics are rule-based and need no external keys.
 */

export interface RiskRuleDef {
  key: string
  name: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  defaultAutoResponse?: string[]
}

export const DEFAULT_RISK_RULES: RiskRuleDef[] = [
  { key: 'access_off_hours', name: 'Access outside normal hours', description: 'Privileged access requested or used outside the configured business hours.', severity: 'medium' },
  { key: 'new_source_ip', name: 'New source IP', description: 'Access from a source address not previously seen for this user.', severity: 'medium' },
  { key: 'disallowed_source', name: 'Disallowed source network', description: 'Access attempted from outside the policy-allowed source networks.', severity: 'high', defaultAutoResponse: ['block_session'] },
  { key: 'repeated_failed_access', name: 'Repeated failed access', description: 'Multiple failed access attempts in a short window.', severity: 'high' },
  { key: 'repeated_rejection', name: 'Repeated approval rejection', description: 'A user whose access requests are repeatedly rejected keeps requesting.', severity: 'medium' },
  { key: 'excessive_reveals', name: 'Excessive credential reveals', description: 'An unusual number of credential reveals in a short window.', severity: 'high' },
  { key: 'bulk_export', name: 'Bulk account export attempt', description: 'An attempt to export a large number of accounts/credentials.', severity: 'high', defaultAutoResponse: ['alert'] },
  { key: 'first_critical_access', name: 'First access to a critical target', description: 'A user accessing a critical account for the first time.', severity: 'medium' },
  { key: 'concurrent_sources', name: 'Concurrent access from different sources', description: 'The same identity is active from multiple source addresses at once.', severity: 'high' },
  { key: 'rotation_overdue', name: 'Rotation disabled or overdue', description: 'A managed account whose credential rotation is disabled or overdue.', severity: 'medium' },
  { key: 'reconcile_failure', name: 'Reconciliation failure', description: 'Credential reconciliation against the target failed.', severity: 'high' },
  { key: 'break_glass', name: 'Break-glass access', description: 'Emergency break-glass access was invoked.', severity: 'critical', defaultAutoResponse: ['alert'] },
  { key: 'session_without_recording', name: 'Session without required recording', description: 'A session policy required recording but none was produced.', severity: 'high' },
  { key: 'blocked_command', name: 'Blocked command attempt', description: 'A command matched the platform/policy denylist and was blocked.', severity: 'high' },
  { key: 'jit_revoke_failure', name: 'JIT revocation failure', description: 'A just-in-time entitlement could not be revoked at expiry.', severity: 'critical', defaultAutoResponse: ['alert'] },
  { key: 'audit_integrity_failure', name: 'Audit-chain integrity failure', description: 'The PAM audit hash chain or a signed checkpoint failed verification.', severity: 'critical', defaultAutoResponse: ['alert'] },
  { key: 'recording_integrity_failure', name: 'Recording integrity failure', description: 'A session recording failed checksum/signature verification.', severity: 'critical', defaultAutoResponse: ['alert'] },
  { key: 'excessive_secret_retrieval', name: 'Unusual secret retrieval volume', description: 'An application retrieved secrets far above its normal rate.', severity: 'high' },
  { key: 'vendor_out_of_window', name: 'Vendor access outside contract/window', description: 'A vendor accessed outside their contract dates or allowed window.', severity: 'high' },
  { key: 'standing_privilege', name: 'Standing privileged access (ZSP)', description: 'Permanent privileged membership detected while zero-standing-privilege is required.', severity: 'high' }
]

export interface RiskEventInput {
  ruleKey: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  confidence?: number
  actor?: string | null
  accountId?: string | null
  target?: string | null
  sessionId?: string | null
  requestId?: string | null
  evidence?: unknown
  explanation?: string
  recommendedAction?: string
}

const RULE_INDEX = new Map(DEFAULT_RISK_RULES.map((r) => [r.key, r]))

/** Record a risk event (and notify on high/critical). Returns the event id. */
export async function recordRisk(input: RiskEventInput, db: Pool = getPamDb()): Promise<string> {
  const def = RULE_INDEX.get(input.ruleKey)
  const severity = input.severity ?? def?.severity ?? 'medium'
  const id = newId()
  await db.query(
    `INSERT INTO pam.risk_events
      (id, rule_key, severity, confidence, actor, account_id, target, session_id, request_id,
       evidence, explanation, recommended_action, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13)`,
    [id, input.ruleKey, severity, input.confidence ?? 60, input.actor ?? null, input.accountId ?? null,
      input.target ?? null, input.sessionId ?? null, input.requestId ?? null,
      input.evidence === undefined ? null : JSON.stringify(input.evidence),
      input.explanation ?? def?.description ?? input.ruleKey, input.recommendedAction ?? null, nowIso()]
  ).catch((err) => { console.error('[pam:risk] failed to record risk event', err?.message) })

  if (severity === 'high' || severity === 'critical') {
    await pamNotify({
      severity: severity === 'critical' ? 'critical' : 'warning',
      event: `risk.${input.ruleKey}`,
      title: `PAM risk: ${def?.name ?? input.ruleKey}`,
      body: input.explanation ?? def?.description ?? 'A privileged-access risk rule fired.',
      link: '/pam/risk'
    }).catch(() => {})
  }
  return id
}
