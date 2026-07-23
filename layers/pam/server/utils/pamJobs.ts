import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { recordRisk } from './pamRisk'
import { generatePassword, type PasswordPolicy } from './pamPassword'
import { storeCredentialVersion, openActiveCredential, openCredentialVersion } from './pamVault'
import { connectorForPlatform } from '../connectors/registry'
import type { ConnectorActionContext, CredentialConnector } from '../connectors/types'

/**
 * Credential-lifecycle worker. Jobs live in pam.credential_jobs; workers claim
 * them with FOR UPDATE SKIP LOCKED under a lease, serialized per target by
 * concurrency_key. Retries use exponential backoff up to max_attempts, then the
 * job moves to the dead-letter state and raises an alert. Every attempt is
 * recorded. Enqueue is idempotent when an idempotency_key is supplied.
 */

export type JobType =
  | 'rotate' | 'verify' | 'reconcile' | 'change' | 'unlock' | 'enable' | 'disable'
  | 'test_connection' | 'discover' | 'update_dependencies' | 'revoke_grant' | 'purge'

export interface EnqueueInput {
  jobType: JobType
  accountId?: string | null
  safeId?: string | null
  platformId?: string | null
  concurrencyKey?: string | null
  idempotencyKey?: string | null
  trigger?: string
  priority?: number
  maxAttempts?: number
  runAfter?: string
  payload?: unknown
  createdBy?: string
}

const BACKOFF_BASE_MS = 15_000
const LEASE_MS = 5 * 60_000

export async function enqueueJob(input: EnqueueInput, db: Pool = getPamDb()): Promise<{ id: string; deduped: boolean }> {
  if (input.idempotencyKey) {
    const { rows } = await db.query(
      "SELECT id FROM pam.credential_jobs WHERE idempotency_key = $1 AND status IN ('queued','leased','running')",
      [input.idempotencyKey]
    )
    if (rows.length) return { id: rows[0].id, deduped: true }
  }
  const id = newId()
  await db.query(
    `INSERT INTO pam.credential_jobs
      (id, job_type, account_id, safe_id, platform_id, concurrency_key, idempotency_key,
       status, priority, trigger, run_after, max_attempts, payload, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,$10,$11,$12,$13,$14)`,
    [id, input.jobType, input.accountId ?? null, input.safeId ?? null, input.platformId ?? null,
      input.concurrencyKey ?? input.accountId ?? null, input.idempotencyKey ?? null,
      input.priority ?? 100, input.trigger ?? 'manual', input.runAfter ?? nowIso(),
      input.maxAttempts ?? 5, input.payload === undefined ? null : JSON.stringify(input.payload),
      nowIso(), input.createdBy ?? 'system']
  )
  return { id, deduped: false }
}

/** Claim one runnable job (per-target serialized) with FOR UPDATE SKIP LOCKED. */
export async function claimJob(worker: string, db: Pool = getPamDb()): Promise<any | null> {
  const now = nowIso()
  const leaseExpiry = new Date(Date.now() + LEASE_MS).toISOString()
  const { rows } = await db.query(
    `UPDATE pam.credential_jobs j
        SET status='running', lease_owner=$1, leased_at=$2, lease_expires_at=$3,
            started_at=COALESCE(j.started_at,$2), attempts=j.attempts+1, updated_at=$2
      WHERE j.id = (
        SELECT c.id FROM pam.credential_jobs c
         WHERE c.status='queued' AND c.run_after <= $2 AND c.cancel_requested = false
           AND NOT EXISTS (
             SELECT 1 FROM pam.credential_jobs r
              WHERE r.status='running' AND r.concurrency_key IS NOT NULL
                AND r.concurrency_key = c.concurrency_key AND r.id <> c.id)
         ORDER BY c.priority ASC, c.run_after ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING j.*`,
    [worker, now, leaseExpiry]
  )
  return rows[0] ?? null
}

/** Release leases whose owner died mid-flight (lease expired) back to queued. */
export async function reclaimExpiredLeases(db: Pool = getPamDb()): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE pam.credential_jobs
        SET status='queued', lease_owner=NULL, leased_at=NULL, lease_expires_at=NULL, updated_at=$1
      WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1`,
    [nowIso()]
  )
  return rowCount ?? 0
}

async function recordAttempt(jobId: string, attempt: number, worker: string, status: string, error: string | null, detail: string | null, db: Pool): Promise<void> {
  await db.query(
    `INSERT INTO pam.credential_job_attempts (id, job_id, attempt, worker, status, started_at, finished_at, error, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)`,
    [newId(), jobId, attempt, worker, status, nowIso(), error, detail]
  ).catch(() => {})
}

function parsePolicy(raw: unknown, fallback?: PasswordPolicy): PasswordPolicy {
  if (!raw) return fallback ?? {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw as PasswordPolicy } catch { return fallback ?? {} }
}

async function buildContext(account: any, platform: any, connector: CredentialConnector, db: Pool): Promise<ConnectorActionContext> {
  const current = await openActiveCredential(account.id, db).catch(() => null)
  // Resolve a logon account credential if one is linked.
  let logonCredential: string | null = null
  const { rows: links } = await db.query(
    "SELECT linked_account_id FROM pam.account_links WHERE account_id = $1 AND link_type = 'logon' LIMIT 1",
    [account.id]
  )
  if (links.length) {
    const logon = await openActiveCredential(links[0].linked_account_id, db).catch(() => null)
    logonCredential = logon?.value ?? null
  }
  const config = { ...(platform?.change_procedure ? safeJson(platform.change_procedure) : {}), ...safeJson(account.custom_properties) }
  return {
    address: account.address ?? null,
    port: account.port ?? null,
    username: account.username,
    currentCredential: current?.value ?? null,
    logonCredential,
    config,
    log: (msg: string) => console.log(`[pam:job:${connector.key}] ${msg}`)
  }
}

function safeJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown> } catch { return {} }
}

async function loadAccountAndPlatform(accountId: string, db: Pool): Promise<{ account: any; platform: any } | null> {
  const { rows } = await db.query('SELECT * FROM pam.accounts WHERE id = $1 AND deleted_at IS NULL', [accountId])
  if (!rows.length) return null
  const account = rows[0]
  let platform = null
  if (account.platform_id) {
    const p = await db.query('SELECT * FROM pam.platforms WHERE id = $1', [account.platform_id])
    platform = p.rows[0] ?? null
  }
  return { account, platform }
}

export interface JobOutcome { ok: boolean; detail: string; terminal?: boolean }

/** Execute a single job's business logic. Returns success/failure + detail. */
export async function runJob(job: any, db: Pool = getPamDb()): Promise<JobOutcome> {
  switch (job.job_type as JobType) {
    case 'rotate': return doRotate(job, db)
    case 'change': return doRotate(job, db)
    case 'verify': return doVerify(job, db)
    case 'reconcile': return doReconcile(job, db)
    case 'test_connection': return doTest(job, db)
    case 'discover': return doDiscover(job, db)
    case 'revoke_grant': return doRevokeGrant(job, db)
    case 'enable':
    case 'disable':
    case 'unlock':
      return { ok: true, detail: `${job.job_type} acknowledged` }
    default:
      return { ok: false, detail: `Unsupported job type: ${job.job_type}`, terminal: true }
  }
}

async function doRotate(job: any, db: Pool): Promise<JobOutcome> {
  if (!job.account_id) return { ok: false, detail: 'rotate requires an account', terminal: true }
  const loaded = await loadAccountAndPlatform(job.account_id, db)
  if (!loaded) return { ok: false, detail: 'account not found', terminal: true }
  const { account, platform } = loaded
  const connector = connectorForPlatform(platform)
  if (!connector?.change) return { ok: false, detail: 'connector cannot change credentials', terminal: true }

  const policy = parsePolicy(platform?.password_policy, connector.passwordPolicy)
  const newCredential = generatePassword(policy, account.username)
  const ctx = await buildContext(account, platform, connector, db)
  ctx.newCredential = newCredential

  const result = await connector.change(ctx)
  if (!result.ok) {
    // requiresRunner is terminal (retrying in-process will never succeed).
    return { ok: false, detail: result.detail ?? 'change failed', terminal: !!result.requiresRunner }
  }
  await storeCredentialVersion({ accountId: account.id, plaintext: newCredential, source: 'rotation', createdBy: job.created_by || 'worker' }, db)
  await db.query("UPDATE pam.accounts SET rotation_status='managed', next_rotation_at=$2 WHERE id=$1",
    [account.id, nextRotation(platform, account)])
  return { ok: true, detail: result.detail ?? 'rotated' }
}

async function doVerify(job: any, db: Pool): Promise<JobOutcome> {
  if (!job.account_id) return { ok: false, detail: 'verify requires an account', terminal: true }
  const loaded = await loadAccountAndPlatform(job.account_id, db)
  if (!loaded) return { ok: false, detail: 'account not found', terminal: true }
  const { account, platform } = loaded
  const connector = connectorForPlatform(platform)
  if (!connector?.verify) return { ok: false, detail: 'connector cannot verify', terminal: true }
  const ctx = await buildContext(account, platform, connector, db)
  const result = await connector.verify(ctx)
  await db.query(
    'UPDATE pam.credential_versions SET verified_at=$2, verify_result=$3 WHERE account_id=$1 AND active=true',
    [account.id, nowIso(), result.ok ? 'ok' : 'failed']
  )
  await db.query('UPDATE pam.accounts SET last_verified=$2 WHERE id=$1', [account.id, nowIso()])
  if (result.requiresRunner) return { ok: false, detail: result.detail ?? 'verify unavailable', terminal: true }
  return { ok: result.ok, detail: result.detail ?? (result.ok ? 'verified' : 'verification failed') }
}

async function doReconcile(job: any, db: Pool): Promise<JobOutcome> {
  if (!job.account_id) return { ok: false, detail: 'reconcile requires an account', terminal: true }
  const loaded = await loadAccountAndPlatform(job.account_id, db)
  if (!loaded) return { ok: false, detail: 'account not found', terminal: true }
  const { account, platform } = loaded
  const connector = connectorForPlatform(platform)
  if (!connector?.reconcile) return { ok: false, detail: 'connector cannot reconcile', terminal: true }
  const ctx = await buildContext(account, platform, connector, db)
  const result = await connector.reconcile(ctx)
  await db.query('UPDATE pam.accounts SET last_reconciled=$2 WHERE id=$1', [account.id, nowIso()])
  if (!result.ok && !result.requiresRunner) {
    await recordRisk({ ruleKey: 'reconcile_failure', accountId: account.id, target: account.address, explanation: result.detail }, db)
  }
  if (result.requiresRunner) return { ok: false, detail: result.detail ?? 'reconcile unavailable', terminal: true }
  return { ok: result.ok, detail: result.detail ?? (result.ok ? 'reconciled' : 'reconcile failed') }
}

async function doTest(job: any, db: Pool): Promise<JobOutcome> {
  if (!job.account_id) return { ok: false, detail: 'test requires an account', terminal: true }
  const loaded = await loadAccountAndPlatform(job.account_id, db)
  if (!loaded) return { ok: false, detail: 'account not found', terminal: true }
  const { account, platform } = loaded
  const connector = connectorForPlatform(platform)
  if (!connector?.test) return { ok: false, detail: 'connector cannot test', terminal: true }
  const ctx = await buildContext(account, platform, connector, db)
  const result = await connector.test(ctx)
  if (result.requiresRunner) return { ok: false, detail: result.detail ?? 'test unavailable', terminal: true }
  return { ok: result.ok, detail: result.detail ?? (result.ok ? 'connection ok' : 'connection failed') }
}

async function doDiscover(job: any, db: Pool): Promise<JobOutcome> {
  const payload = safeJson(job.payload)
  const accountId = job.account_id
  if (!accountId) return { ok: false, detail: 'discover requires a credential account in this build', terminal: true }
  const loaded = await loadAccountAndPlatform(accountId, db)
  if (!loaded) return { ok: false, detail: 'account not found', terminal: true }
  const { account, platform } = loaded
  const connector = connectorForPlatform(platform)
  if (!connector?.discover) return { ok: false, detail: 'connector cannot discover', terminal: true }
  const ctx = await buildContext(account, platform, connector, db)
  const result = await connector.discover(ctx)
  if (!result.ok) return { ok: false, detail: result.detail ?? 'discovery failed', terminal: !!(result as any).requiresRunner }
  let created = 0
  for (const acct of result.accounts) {
    const fp = `${payload.sourceId ?? 'adhoc'}:${account.address ?? ''}:${acct.username}`
    const ins = await db.query(
      `INSERT INTO pam.discovered_accounts
        (id, source_id, run_id, username, address, account_type, privileged_group, privilege_level, fingerprint, status, details, first_seen, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$11)
       ON CONFLICT (fingerprint) DO UPDATE SET last_seen = $11
       RETURNING (xmax = 0) AS inserted`,
      [newId(), payload.sourceId ?? null, payload.runId ?? null, acct.username, account.address ?? null,
        acct.account_type ?? null, acct.privileged_group ?? null, acct.privilege_level ?? null, fp,
        JSON.stringify(acct), nowIso()]
    )
    if (ins.rows[0]?.inserted) created++
  }
  return { ok: true, detail: `discovered ${result.accounts.length} accounts (${created} new)` }
}

async function doRevokeGrant(job: any, db: Pool): Promise<JobOutcome> {
  const payload = safeJson(job.payload)
  const grantId = String(payload.grantId || '')
  if (!grantId) return { ok: false, detail: 'revoke_grant requires grantId', terminal: true }
  await db.query("UPDATE pam.access_grants SET status='revoked', revoked_at=$2, revoke_reason=$3 WHERE id=$1 AND status='active'",
    [grantId, nowIso(), String(payload.reason || 'expired')])
  await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason='grant revoked' WHERE grant_id=$1 AND state IN ('starting','active','idle')",
    [grantId, nowIso()])
  return { ok: true, detail: 'grant revoked; sessions terminated' }
}

function nextRotation(platform: any, account: any): string {
  const days = Number(safeJson(platform?.rotation_policy)?.intervalDays) || 90
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

/** Finalize a job after runJob: success, retry-with-backoff, or dead-letter. */
export async function finalizeJob(job: any, outcome: JobOutcome, worker: string, db: Pool = getPamDb()): Promise<void> {
  await recordAttempt(job.id, job.attempts, worker, outcome.ok ? 'succeeded' : 'failed', outcome.ok ? null : outcome.detail, outcome.detail, db)
  if (outcome.ok) {
    await db.query("UPDATE pam.credential_jobs SET status='succeeded', finished_at=$2, updated_at=$2, result=$3, last_error=NULL WHERE id=$1",
      [job.id, nowIso(), JSON.stringify({ detail: outcome.detail })])
    return
  }
  const attempts = Number(job.attempts)
  const maxAttempts = Number(job.max_attempts)
  const dead = outcome.terminal || attempts >= maxAttempts
  if (dead) {
    await db.query("UPDATE pam.credential_jobs SET status='dead', finished_at=$2, updated_at=$2, last_error=$3 WHERE id=$1",
      [job.id, nowIso(), outcome.detail])
    await appendAudit({ actor: 'system', action: 'job.dead_letter', objectType: 'credential_job', objectId: job.id, result: 'failure', severity: 'high', reason: outcome.detail }, db).catch(() => {})
    await pamNotify({ severity: 'warning', event: 'job.failed', title: `PAM ${job.job_type} failed`, body: outcome.detail, objectType: 'credential_job', objectId: job.id, link: '/pam/accounts' }, db).catch(() => {})
    if (job.job_type === 'rotate' && job.account_id) {
      await db.query("UPDATE pam.accounts SET rotation_status='failed' WHERE id=$1", [job.account_id]).catch(() => {})
    }
  } else {
    const backoff = BACKOFF_BASE_MS * Math.pow(2, attempts - 1)
    await db.query("UPDATE pam.credential_jobs SET status='queued', lease_owner=NULL, run_after=$2, updated_at=$3, last_error=$4 WHERE id=$1",
      [job.id, new Date(Date.now() + backoff).toISOString(), nowIso(), outcome.detail])
  }
}

/** One worker tick: reclaim stale leases, cancel requested jobs, process a batch. */
export async function workerTick(worker: string, batch = 4, db: Pool = getPamDb()): Promise<number> {
  await reclaimExpiredLeases(db).catch(() => {})
  await db.query("UPDATE pam.credential_jobs SET status='cancelled', updated_at=$1 WHERE status='queued' AND cancel_requested=true", [nowIso()]).catch(() => {})
  let processed = 0
  for (let i = 0; i < batch; i++) {
    const job = await claimJob(worker, db)
    if (!job) break
    try {
      const outcome = await runJob(job, db)
      await finalizeJob(job, outcome, worker, db)
    } catch (err: any) {
      await finalizeJob(job, { ok: false, detail: String(err?.message || err) }, worker, db).catch(() => {})
    }
    processed++
  }
  return processed
}
