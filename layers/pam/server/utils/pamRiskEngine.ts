import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso, getPamSetting } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { DEFAULT_RISK_RULES } from './pamRisk'
import {
  type RiskCandidate, type BusinessHours, type SessionRow,
  evalOffHours, evalConcurrentSources, evalNewSourceIp, evalFirstCriticalAccess,
  evalRepeatedFailedAccess, evalRepeatedRejection, evalRotationOverdue,
  evalSessionWithoutRecording, evalVendorOutOfWindow, parseAutoResponse, parseConfig, threshold
} from './pamRiskEngineCore'

/**
 * Stage 8 — the risk EVALUATION ENGINE (spec §12). Runs on the maintenance
 * sweep. It reads real event sources (sessions, audit failures, rejected
 * requests, accounts, vendor users), evaluates every ENABLED rule via the pure
 * core, records each finding EXACTLY ONCE (dedupe_key), and then EXECUTES the
 * rule's configured `auto_response` as a real action (block live sessions,
 * disable an account, suspend a vendor, open an investigation, alert) — closing
 * the gap where auto-responses were stored but never executed.
 */

interface RuleCfg { enabled: boolean; severity: string; config: Record<string, any>; autoResponse: string[] }

const DEF_SEVERITY = new Map(DEFAULT_RISK_RULES.map((r) => [r.key, r.severity as string]))
const DEF_AUTO = new Map(DEFAULT_RISK_RULES.map((r) => [r.key, r.defaultAutoResponse ?? []]))

/** Load per-rule enabled flag, severity, parsed config and auto_response list. */
export async function loadRules(db: Pool = getPamDb()): Promise<Map<string, RuleCfg>> {
  const { rows } = await db.query('SELECT rule_key, enabled, severity, config, auto_response FROM pam.risk_rules')
  const map = new Map<string, RuleCfg>()
  for (const r of rows) {
    map.set(r.rule_key, {
      enabled: r.enabled !== false,
      severity: r.severity || DEF_SEVERITY.get(r.rule_key) || 'medium',
      config: parseConfig(r.config),
      autoResponse: parseAutoResponse(r.auto_response, DEF_AUTO.get(r.rule_key) || [])
    })
  }
  return map
}

/** Insert a risk event once per dedupe key. Returns the new id, or null if it already existed. */
export async function recordRiskDeduped(c: RiskCandidate, severity: string, db: Pool = getPamDb()): Promise<string | null> {
  const id = newId()
  const { rows } = await db.query(
    `INSERT INTO pam.risk_events
       (id, rule_key, severity, confidence, actor, account_id, target, session_id, request_id,
        evidence, explanation, recommended_action, status, dedupe_key, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13,$14)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [id, c.ruleKey, severity, c.confidence ?? 60, c.actor ?? null, c.accountId ?? null, c.target ?? null,
      c.sessionId ?? null, c.requestId ?? null, c.evidence === undefined ? null : JSON.stringify(c.evidence),
      c.explanation ?? c.ruleKey, c.recommendedAction ?? null, c.dedupeKey, nowIso()]
  )
  return rows[0]?.id ?? null
}

const notifySeverity = (s: string) => (s === 'critical' ? 'critical' : s === 'low' ? 'info' : 'warning') as 'info' | 'warning' | 'critical'

/**
 * Execute a rule's auto-responses as REAL actions and record what was done.
 * Every action is audited and appended to the event's auto_response_taken.
 */
export async function executeAutoResponse(eventId: string, c: RiskCandidate, severity: string, actions: string[], db: Pool = getPamDb()): Promise<string[]> {
  const taken: string[] = []
  for (const action of actions) {
    try {
      if (action === 'alert') {
        await pamNotify({
          severity: notifySeverity(severity), event: `risk.${c.ruleKey}`,
          title: `PAM risk: ${c.ruleKey}`, body: c.explanation ?? 'A privileged-access risk rule fired.',
          objectType: 'risk_event', objectId: eventId, link: '/pam/risk'
        }, db)
        taken.push('alert')
      } else if (action === 'block_session') {
        // Terminate the offending live session, or all live sessions for the actor.
        const res = c.sessionId
          ? await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason=$3 WHERE id=$1 AND state IN ('starting','active','idle')", [c.sessionId, nowIso(), `auto-response: ${c.ruleKey}`])
          : c.actor
            ? await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason=$3 WHERE principal=$1 AND state IN ('starting','active','idle')", [c.actor, nowIso(), `auto-response: ${c.ruleKey}`])
            : { rowCount: 0 }
        if ((res.rowCount ?? 0) > 0) taken.push(`block_session(${res.rowCount})`)
      } else if (action === 'disable_account' && c.accountId) {
        const res = await db.query('UPDATE pam.accounts SET enabled=false, updated_at=$2 WHERE id=$1 AND deleted_at IS NULL', [c.accountId, nowIso()])
        if ((res.rowCount ?? 0) > 0) taken.push('disable_account')
      } else if (action === 'suspend_vendor' && c.actor) {
        const res = await db.query(
          "UPDATE pam.vendors SET status='suspended', updated_at=$2 WHERE id IN (SELECT vendor_id FROM pam.vendor_users WHERE email=$1 AND status='active') AND status='active'",
          [c.actor, nowIso()])
        if ((res.rowCount ?? 0) > 0) taken.push('suspend_vendor')
      } else if (action === 'open_investigation') {
        await db.query("UPDATE pam.risk_events SET status='investigating', updated_at=$2 WHERE id=$1 AND status='open'", [eventId, nowIso()])
        taken.push('open_investigation')
      }
    } catch (err: any) {
      console.error(`[pam:risk] auto-response ${action} failed for ${c.ruleKey}`, err?.message)
    }
  }
  if (taken.length) {
    await db.query('UPDATE pam.risk_events SET auto_response_taken=$2, updated_at=$3 WHERE id=$1', [eventId, JSON.stringify(taken), nowIso()])
    await appendAudit({ actor: 'system', action: 'risk.auto_response', objectType: 'risk_event', objectId: eventId,
      result: 'success', severity: severity === 'critical' ? 'critical' : 'warning', reason: `${c.ruleKey}: ${taken.join(', ')}` }, db).catch(() => {})
  }
  return taken
}

export interface RiskEvalResult { evaluated: number; created: number; actions: number; byRule: Record<string, number> }

/**
 * Evaluate all enabled rules against real event sources; persist new findings
 * idempotently and execute their auto-responses. Safe to run every sweep.
 */
export async function evaluateRiskRules(db: Pool = getPamDb(), opts: { lookbackMinutes?: number } = {}): Promise<RiskEvalResult> {
  const rules = await loadRules(db)
  const enabled = (k: string) => rules.get(k)?.enabled !== false
  const now = new Date()
  const nowStr = now.toISOString()
  const windowStart = new Date(now.getTime() - (opts.lookbackMinutes ?? 1440) * 60_000).toISOString()
  const hourBucket = nowStr.slice(0, 13)
  const dayBucket = nowStr.slice(0, 10)
  const bh = await getPamSetting<BusinessHours>('business_hours', { days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' }, db)

  const candidates: RiskCandidate[] = []

  // Session-derived rules share one fetch.
  if (enabled('access_off_hours') || enabled('new_source_ip') || enabled('session_without_recording') || enabled('concurrent_sources')) {
    const recent = (await db.query(
      `SELECT id, principal, account_id, target, source_ip, started_at, state, recording_required, recording_status
         FROM pam.sessions WHERE started_at >= $1 ORDER BY started_at`, [windowStart])).rows as (SessionRow & { state: string })[]
    if (enabled('access_off_hours')) candidates.push(...evalOffHours(recent, bh))
    if (enabled('session_without_recording')) {
      const ended = recent.filter((s) => ['ended', 'terminated', 'error'].includes(s.state))
      candidates.push(...evalSessionWithoutRecording(ended))
    }
    if (enabled('new_source_ip')) {
      const seen = new Set((await db.query('SELECT DISTINCT principal, source_ip FROM pam.sessions WHERE source_ip IS NOT NULL AND started_at < $1', [windowStart])).rows.map((r) => `${r.principal}|${r.source_ip}`))
      candidates.push(...evalNewSourceIp(recent, seen))
    }
    if (enabled('concurrent_sources')) {
      const active = (await db.query("SELECT id, principal, source_ip, started_at FROM pam.sessions WHERE state IN ('starting','active','idle')")).rows as SessionRow[]
      candidates.push(...evalConcurrentSources(active, hourBucket))
    }
  }

  if (enabled('first_critical_access')) {
    const recentCrit = (await db.query(
      `SELECT s.id, s.principal, s.account_id, s.target, s.started_at
         FROM pam.sessions s JOIN pam.accounts a ON a.id = s.account_id
        WHERE s.started_at >= $1 AND a.criticality = 'critical'`, [windowStart])).rows as SessionRow[]
    const prior = new Set((await db.query('SELECT DISTINCT principal, account_id FROM pam.sessions WHERE account_id IS NOT NULL AND started_at < $1', [windowStart])).rows.map((r) => `${r.principal}|${r.account_id}`))
    candidates.push(...evalFirstCriticalAccess(recentCrit, prior))
  }

  if (enabled('repeated_failed_access')) {
    const counts = (await db.query("SELECT actor AS key, count(*)::int AS count FROM pam.audit_events WHERE ts >= $1 AND result IN ('failure','denied') GROUP BY actor", [windowStart])).rows
    candidates.push(...evalRepeatedFailedAccess(counts, threshold(rules.get('repeated_failed_access')?.config ?? {}, 'threshold', 5), hourBucket))
  }

  if (enabled('repeated_rejection')) {
    const counts = (await db.query("SELECT requester AS key, count(*)::int AS count FROM pam.access_requests WHERE status='rejected' AND COALESCE(decided_at, created_at) >= $1 GROUP BY requester", [windowStart])).rows
    candidates.push(...evalRepeatedRejection(counts, threshold(rules.get('repeated_rejection')?.config ?? {}, 'threshold', 3), dayBucket))
  }

  if (enabled('rotation_overdue')) {
    const accts = (await db.query(
      `SELECT id, name, auto_managed, rotation_status, next_rotation_at FROM pam.accounts
        WHERE deleted_at IS NULL AND enabled = true
          AND (rotation_status = 'failed' OR (auto_managed = true AND next_rotation_at IS NOT NULL AND next_rotation_at < $1))`, [nowStr])).rows
    candidates.push(...evalRotationOverdue(accts, nowStr, dayBucket))
  }

  if (enabled('vendor_out_of_window')) {
    const vus = (await db.query(
      `SELECT vu.id, vu.email, vu.vendor_id, v.name AS vendor_name, vu.status AS vu_status, v.status AS vendor_status, v.contract_end
         FROM pam.vendor_users vu JOIN pam.vendors v ON v.id = vu.vendor_id WHERE vu.status = 'active'`)).rows
    candidates.push(...evalVendorOutOfWindow(vus, nowStr, dayBucket))
  }

  // Persist + respond.
  const byRule: Record<string, number> = {}
  let created = 0, actions = 0
  for (const c of candidates) {
    const cfg = rules.get(c.ruleKey)
    const severity = c.severity ?? cfg?.severity ?? DEF_SEVERITY.get(c.ruleKey) ?? 'medium'
    const id = await recordRiskDeduped(c, severity, db)
    if (!id) continue
    created++
    byRule[c.ruleKey] = (byRule[c.ruleKey] ?? 0) + 1
    // High/critical always alert even if the rule configures no explicit response.
    const acts = [...(cfg?.autoResponse ?? [])]
    if ((severity === 'high' || severity === 'critical') && !acts.includes('alert')) acts.push('alert')
    const taken = await executeAutoResponse(id, c, severity, acts, db)
    actions += taken.length
  }
  return { evaluated: candidates.length, created, actions, byRule }
}
