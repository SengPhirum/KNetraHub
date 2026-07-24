import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { openActiveCredential } from './pamVault'
import { enqueueJob } from './pamJobs'
import { getConnector, connectorForPlatform } from '../connectors/registry'
import { matchRule, discoveryFingerprint, type Condition, type DiscoveredFacts } from './pamDiscoveryCore'

/**
 * Discovery + onboarding engine. A source names a connector-backed target (or a
 * CSV/REST import) and a privileged credential account; a scan runs the
 * connector's `discover` (in-process for postgresql, delegated to the runner for
 * ssh/ldap/db bundles), upserts the results into the pending queue (deduped by
 * fingerprint, deltas counted), then applies the priority-ordered onboarding
 * rules — auto-onboarding, flagging for review, or ignoring.
 */

function safeJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown> } catch { return {} }
}

// ── Sources ─────────────────────────────────────────────────────────────────

export interface SourceInput {
  name: string; sourceType: string; config?: unknown; credentialAccountId?: string | null
  includeScopes?: unknown; excludeScopes?: unknown; rateLimit?: number | null; enabled?: boolean; actor?: string
}

export async function createSource(i: SourceInput, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  await db.query(
    `INSERT INTO pam.discovery_sources (id, name, source_type, config, credential_account_id, include_scopes, exclude_scopes, rate_limit, enabled, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, i.name, i.sourceType, i.config ? JSON.stringify(i.config) : null, i.credentialAccountId ?? null,
      i.includeScopes ? JSON.stringify(i.includeScopes) : null, i.excludeScopes ? JSON.stringify(i.excludeScopes) : null,
      i.rateLimit ?? null, i.enabled !== false, nowIso(), i.actor ?? 'system']
  )
  return id
}

export async function updateSource(id: string, patch: Partial<SourceInput>, db: Pool = getPamDb()): Promise<void> {
  const cur = (await db.query('SELECT * FROM pam.discovery_sources WHERE id=$1', [id])).rows[0]
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  await db.query(
    `UPDATE pam.discovery_sources SET name=$2, source_type=$3, config=$4, credential_account_id=$5, include_scopes=$6, exclude_scopes=$7, rate_limit=$8, enabled=$9, updated_at=$10, updated_by=$11 WHERE id=$1`,
    [id, patch.name ?? cur.name, patch.sourceType ?? cur.source_type,
      patch.config !== undefined ? JSON.stringify(patch.config) : cur.config,
      patch.credentialAccountId !== undefined ? patch.credentialAccountId : cur.credential_account_id,
      patch.includeScopes !== undefined ? JSON.stringify(patch.includeScopes) : cur.include_scopes,
      patch.excludeScopes !== undefined ? JSON.stringify(patch.excludeScopes) : cur.exclude_scopes,
      patch.rateLimit !== undefined ? patch.rateLimit : cur.rate_limit,
      patch.enabled !== undefined ? patch.enabled : cur.enabled, nowIso(), patch.actor ?? 'system']
  )
}

export async function deleteSource(id: string, db: Pool = getPamDb()): Promise<void> {
  await db.query('DELETE FROM pam.discovery_sources WHERE id=$1', [id])
}

export async function listSources(db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.discovery_sources ORDER BY created_at DESC')).rows
}

async function ctxForSource(source: any, db: Pool): Promise<DiscoverCtx | null> {
  if (!source.credential_account_id) return null
  const acct = (await db.query('SELECT * FROM pam.accounts WHERE id=$1', [source.credential_account_id])).rows[0]
  if (!acct) return null
  const cred = await openActiveCredential(acct.id, db).catch(() => null)
  return {
    address: acct.address, port: acct.port, username: acct.username,
    currentCredential: cred?.value ?? null, logonCredential: null,
    config: { ...safeJson(source.config), ...safeJson(acct.custom_properties) }, log: () => {}
  }
}

interface DiscoverCtx { address: string | null; port: number | null; username: string; currentCredential: string | null; logonCredential: string | null; config: Record<string, unknown>; log: (m: string) => void }

/** Test a source's connectivity using its credential account. */
export async function testSource(sourceId: string, db: Pool = getPamDb()): Promise<{ ok: boolean; detail: string }> {
  const source = (await db.query('SELECT * FROM pam.discovery_sources WHERE id=$1', [sourceId])).rows[0]
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  if (['csv', 'rest', 'ipam', 'monitoring'].includes(source.source_type)) return { ok: true, detail: 'import source (no live connection)' }
  const connector = getConnector(source.source_type) || connectorForPlatform({ connector_key: source.source_type })
  const ctx = await ctxForSource(source, db)
  if (!connector?.test || !ctx) return { ok: false, detail: 'no connector/credential for this source' }
  if (!connector.runsInProcess) return { ok: true, detail: 'runner-delegated connector (test runs on the runner)' }
  const r = await connector.test(ctx as any)
  return { ok: !!r.ok, detail: r.detail ?? (r.ok ? 'ok' : 'failed') }
}

// ── Scan ──────────────────────────────────────────────────────────────────────

function importAccounts(source: any): Array<Record<string, unknown>> {
  const cfg = safeJson(source.config)
  if (Array.isArray((cfg as any).accounts)) return (cfg as any).accounts
  return []
}

export async function upsertDiscovered(sourceId: string, runId: string, defaultAddress: string | null, sourceType: string, accounts: Array<Record<string, any>>, db: Pool): Promise<{ total: number; created: number; changed: number }> {
  let created = 0, changed = 0
  for (const a of accounts) {
    const username = String(a.username || '').trim()
    if (!username) continue
    const address = a.address || a.host || defaultAddress || null
    const fp = discoveryFingerprint(sourceId, address, username)
    const existing = address
      ? (await db.query('SELECT id FROM pam.accounts WHERE lower(username)=lower($1) AND address=$2 AND deleted_at IS NULL LIMIT 1', [username, address])).rows[0]
      : null
    const ins = await db.query(
      `INSERT INTO pam.discovered_accounts
        (id, source_id, run_id, username, address, os_type, account_type, privileged_group, privilege_level, source_type,
         non_expiring, existing_account_id, is_duplicate, fingerprint, status, details, first_seen, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,$16)
       ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL
         DO UPDATE SET last_seen=$16, run_id=$3, details=$15, privilege_level=$9, existing_account_id=$12
       RETURNING (xmax = 0) AS inserted`,
      [newId(), sourceId, runId, username, address, a.os_type || null, a.account_type || sourceType,
        a.privileged_group != null ? String(a.privileged_group) : null, a.privilege_level || null, sourceType,
        a.non_expiring ?? null, existing?.id || null, !!existing, fp, JSON.stringify(a), nowIso()]
    )
    if (ins.rows[0]?.inserted) created++; else changed++
  }
  return { total: accounts.length, created, changed }
}

/** Run a discovery scan. In-process connectors resolve synchronously; runner
 * connectors are delegated (the run finalizes when the runner reports). */
export async function runScan(sourceId: string, opts: { actor?: string; trigger?: string; discover?: (ctx: DiscoverCtx) => Promise<{ ok: boolean; accounts: Array<Record<string, unknown>>; detail?: string }> } = {}, db: Pool = getPamDb()): Promise<any> {
  const source = (await db.query('SELECT * FROM pam.discovery_sources WHERE id=$1', [sourceId])).rows[0]
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  const runId = newId()
  const started = nowIso()
  await db.query('INSERT INTO pam.discovery_runs (id, source_id, trigger, status, started_at, actor) VALUES ($1,$2,$3,\'running\',$4,$5)',
    [runId, sourceId, opts.trigger ?? 'manual', started, opts.actor ?? 'system'])
  try {
    const ctx = await ctxForSource(source, db)
    let accounts: Array<Record<string, unknown>> = []

    if (['csv', 'rest', 'ipam', 'monitoring'].includes(source.source_type)) {
      accounts = importAccounts(source)
    } else {
      const connector = getConnector(source.source_type) || connectorForPlatform({ connector_key: source.source_type })
      const discoverFn = opts.discover || (connector?.runsInProcess && connector.discover ? (c: DiscoverCtx) => connector.discover!(c as any) : null)
      if (!discoverFn) {
        if (connector && connector.runsInProcess === false) {
          await enqueueJob({ jobType: 'discover', accountId: source.credential_account_id, handler: 'runner', connectorKey: connector.key, payload: { sourceId, runId }, trigger: 'discovery', createdBy: opts.actor ?? 'system' }, db)
          await db.query("UPDATE pam.discovery_sources SET last_run_at=$2, last_status='dispatched' WHERE id=$1", [sourceId, started])
          return { runId, dispatched: 'runner' }
        }
        throw new Error(`source type "${source.source_type}" has no discover capability`)
      }
      if (!ctx) throw new Error('source has no usable credential account')
      const res = await discoverFn(ctx)
      if (!res.ok) throw new Error(res.detail || 'discover failed')
      accounts = res.accounts
    }

    const counts = await upsertDiscovered(sourceId, runId, ctx?.address ?? null, source.source_type, accounts as any, db)
    const applied = await applyRulesToRun(runId, opts.actor ?? 'system', db)
    await db.query("UPDATE pam.discovery_runs SET status='succeeded', finished_at=$2, accounts_found=$3, new_accounts=$4, changed_accounts=$5, progress=100 WHERE id=$1",
      [runId, nowIso(), counts.total, counts.created, counts.changed])
    await db.query("UPDATE pam.discovery_sources SET last_run_at=$2, last_status='succeeded' WHERE id=$1", [sourceId, nowIso()])
    return { runId, ...counts, applied }
  } catch (e: any) {
    await db.query("UPDATE pam.discovery_runs SET status='failed', finished_at=$2, error=$3 WHERE id=$1", [runId, nowIso(), String(e?.message || e)])
    await db.query("UPDATE pam.discovery_sources SET last_run_at=$2, last_status='failed' WHERE id=$1", [sourceId, nowIso()])
    throw e
  }
}

// ── Onboarding rules ────────────────────────────────────────────────────────

function factsOf(row: any): DiscoveredFacts {
  const d = safeJson(row.details)
  return {
    username: row.username, address: row.address, account_type: row.account_type, os_type: row.os_type,
    environment: row.environment, privilege_level: row.privilege_level, privileged_group: row.privileged_group,
    non_expiring: row.non_expiring, dormant: row.dormant, shared: row.shared, password_age_days: row.password_age_days,
    source_type: row.source_type, ...d
  }
}

export async function loadRules(db: Pool): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.onboarding_rules ORDER BY priority ASC')).rows
    .map((r) => ({ ...r, conditions: safeJson(r.conditions) as Condition }))
}

/** Apply onboarding rules to every pending account in a run. */
export async function applyRulesToRun(runId: string, actor: string, db: Pool): Promise<{ onboarded: number; ignored: number; review: number }> {
  const rules = await loadRules(db)
  const pending = (await db.query("SELECT * FROM pam.discovered_accounts WHERE run_id=$1 AND status='pending'", [runId])).rows
  let onboarded = 0, ignored = 0, review = 0
  for (const acc of pending) {
    const rule = matchRule(rules.map((r) => ({ id: r.id, priority: r.priority, enabled: r.enabled, conditions: r.conditions, action: r.action })), factsOf(acc))
    if (!rule) continue
    const full = rules.find((r) => r.id === rule.id)!
    await db.query('UPDATE pam.discovered_accounts SET matched_rule_id=$2 WHERE id=$1', [acc.id, rule.id])
    if (rule.action === 'onboard' && full.assign_safe_id) {
      await onboardDiscovered(acc.id, { safeId: full.assign_safe_id, platformId: full.assign_platform_id, owner: full.assign_owner, autoManage: full.auto_manage, createdBy: actor }, db)
      onboarded++
    } else if (rule.action === 'ignore') {
      await db.query("UPDATE pam.discovered_accounts SET status='ignored' WHERE id=$1", [acc.id]); ignored++
    } else {
      await db.query("UPDATE pam.discovered_accounts SET status='review' WHERE id=$1", [acc.id]); review++
    }
  }
  return { onboarded, ignored, review }
}

export async function onboardDiscovered(discoveredId: string, opts: { safeId: string; platformId?: string | null; owner?: string | null; autoManage?: boolean; createdBy?: string }, db: Pool = getPamDb()): Promise<string> {
  const d = (await db.query('SELECT * FROM pam.discovered_accounts WHERE id=$1', [discoveredId])).rows[0]
  if (!d) throw createError({ statusCode: 404, statusMessage: 'Discovered account not found' })
  if (d.status === 'onboarded' && d.onboarded_account_id) return d.onboarded_account_id
  const accountId = newId()
  await db.query(
    `INSERT INTO pam.accounts (id, name, username, address, safe_id, platform_id, account_type, privilege_level, auto_managed, discovery_source, enabled, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'discovery',true,$10,$11)`,
    [accountId, `${d.username}@${d.address || 'discovered'}`, d.username, d.address, opts.safeId,
      opts.platformId || null, d.account_type || 'generic', d.privilege_level || null, !!opts.autoManage, nowIso(), opts.createdBy || 'system']
  )
  await db.query("UPDATE pam.discovered_accounts SET status='onboarded', onboarded_account_id=$2 WHERE id=$1", [discoveredId, accountId])
  return accountId
}

export async function bulkAction(ids: string[], action: 'ignore' | 'review' | 'onboard', opts: { safeId?: string; platformId?: string | null; owner?: string | null; reason?: string; createdBy?: string }, db: Pool = getPamDb()): Promise<{ affected: number }> {
  let affected = 0
  for (const id of ids) {
    if (action === 'onboard' && opts.safeId) { await onboardDiscovered(id, { safeId: opts.safeId, platformId: opts.platformId, owner: opts.owner, createdBy: opts.createdBy }, db); affected++ }
    else if (action === 'ignore') { await db.query("UPDATE pam.discovered_accounts SET status='ignored' WHERE id=$1 AND status='pending'", [id]); affected++ }
    else if (action === 'review') { await db.query("UPDATE pam.discovered_accounts SET status='review' WHERE id=$1", [id]); affected++ }
  }
  return { affected }
}

// ── Rule CRUD + simulation ────────────────────────────────────────────────────

export async function createRule(i: any, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  await db.query(
    `INSERT INTO pam.onboarding_rules (id, name, priority, conditions, action, assign_safe_id, assign_platform_id, assign_owner, assign_tags, auto_manage, trigger_reconcile, create_approval, ignore_reason, enabled, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [id, i.name, i.priority ?? 100, JSON.stringify(i.conditions ?? {}), i.action ?? 'review', i.assignSafeId ?? null, i.assignPlatformId ?? null,
      i.assignOwner ?? null, i.assignTags ? JSON.stringify(i.assignTags) : null, !!i.autoManage, !!i.triggerReconcile, !!i.createApproval,
      i.ignoreReason ?? null, i.enabled !== false, nowIso(), i.createdBy ?? 'system']
  )
  return id
}

export async function updateRule(id: string, i: any, db: Pool = getPamDb()): Promise<void> {
  const cur = (await db.query('SELECT * FROM pam.onboarding_rules WHERE id=$1', [id])).rows[0]
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  await db.query(
    `UPDATE pam.onboarding_rules SET name=$2, priority=$3, conditions=$4, action=$5, assign_safe_id=$6, assign_platform_id=$7, assign_owner=$8, assign_tags=$9, auto_manage=$10, trigger_reconcile=$11, create_approval=$12, ignore_reason=$13, enabled=$14, updated_at=$15 WHERE id=$1`,
    [id, i.name ?? cur.name, i.priority ?? cur.priority, i.conditions !== undefined ? JSON.stringify(i.conditions) : cur.conditions,
      i.action ?? cur.action, i.assignSafeId !== undefined ? i.assignSafeId : cur.assign_safe_id, i.assignPlatformId !== undefined ? i.assignPlatformId : cur.assign_platform_id,
      i.assignOwner !== undefined ? i.assignOwner : cur.assign_owner, i.assignTags !== undefined ? JSON.stringify(i.assignTags) : cur.assign_tags,
      i.autoManage !== undefined ? i.autoManage : cur.auto_manage, i.triggerReconcile !== undefined ? i.triggerReconcile : cur.trigger_reconcile,
      i.createApproval !== undefined ? i.createApproval : cur.create_approval, i.ignoreReason !== undefined ? i.ignoreReason : cur.ignore_reason,
      i.enabled !== undefined ? i.enabled : cur.enabled, nowIso()]
  )
}

export async function deleteRule(id: string, db: Pool = getPamDb()): Promise<void> {
  await db.query('DELETE FROM pam.onboarding_rules WHERE id=$1', [id])
}

/** Run any discovery scans whose schedule is due (called from the scheduler). */
export async function runDueScans(db: Pool = getPamDb()): Promise<number> {
  const now = nowIso()
  const due = (await db.query(
    `SELECT s.id, s.source_id, s.interval_seconds
       FROM pam.discovery_schedules s JOIN pam.discovery_sources src ON src.id = s.source_id
      WHERE s.enabled = true AND src.enabled = true AND (s.next_run_at IS NULL OR s.next_run_at <= $1)`,
    [now]
  )).rows
  let n = 0
  for (const row of due) {
    // Advance the schedule BEFORE running so a long scan can't re-trigger.
    await db.query('UPDATE pam.discovery_schedules SET next_run_at=$2 WHERE id=$1',
      [row.id, new Date(Date.now() + Number(row.interval_seconds || 86400) * 1000).toISOString()])
    try { await runScan(row.source_id, { actor: 'scheduler', trigger: 'scheduled' }, db) } catch { /* run row already records the error */ }
    n++
  }
  return n
}

/** Simulate the rule set against a sample account without changing anything. */
export async function simulateRules(sample: DiscoveredFacts, db: Pool = getPamDb()): Promise<{ matched: any | null }> {
  const rules = await loadRules(db)
  const m = matchRule(rules.map((r) => ({ id: r.id, priority: r.priority, enabled: r.enabled, conditions: r.conditions, action: r.action })), sample)
  if (!m) return { matched: null }
  const full = rules.find((r) => r.id === m.id)!
  return { matched: { id: m.id, name: full.name, action: full.action, assign_safe_id: full.assign_safe_id, assign_platform_id: full.assign_platform_id } }
}
