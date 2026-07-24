import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { seal, open } from './pamCrypto'
import { generatePassword } from './pamPassword'
import { openActiveCredential, storeCredentialVersion } from './pamVault'
import { connectorForPlatform, getConnector } from '../connectors/registry'
import { finalizeJob } from './pamJobs'
import {
  generateRunnerToken, hashRunnerToken, signConnector, verifyConnectorPackage,
  applyReportDecision, redactLog, isSafeConnectorRef,
  type ConnectorRunResult, type ConnectorRegistryEntry, type RunnerToken
} from './pamRunnerCore'

/**
 * Runner control plane (DB-backed). Runners are first-class identities with
 * hashed tokens, a per-runner connector allowlist, and expiry. Jobs whose
 * connector cannot run in-process (SSH/WinRM/network/cloud) are delegated: the
 * control plane leases the job to a runner, hands it the target context over the
 * authenticated channel (secrets redacted from logs), and — for a change/rotate
 * — generates the new credential itself and seals it as `pending_secret`. The
 * new version is activated ONLY after the runner reports the target was changed
 * AND independently verified (see applyReportDecision). Every trust decision is
 * delegated to the pure, unit-tested pamRunnerCore.
 */

const RUNNER_LEASE_MS = 5 * 60_000
const RUNNER_POLL_MS = Number(process.env.PAM_RUNNER_POLL_MS || 5000)

/** Signing-key material for connector packages. Fail closed in production. */
export function connectorSigningKey(): string {
  const raw = (process.env.NUXT_PAM_CONNECTOR_SIGNING_KEY || '').trim()
  if (raw) return raw
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[pam:runner] NUXT_PAM_CONNECTOR_SIGNING_KEY is not set — connector verification fails closed')
  }
  return 'knetrahub-pam-connector-signing-development-only'
}

// ── Route helpers ─────────────────────────────────────────────────────────────

/** Authenticate the runner presenting a bearer token on this request, or 401. */
export async function requireRunner(event: any): Promise<any> {
  const token = parseBearer(getHeader(event, 'authorization'))
  const runner = await authenticateRunner(token, getPamDb())
  if (!runner) throw createError({ statusCode: 401, statusMessage: 'Invalid, disabled or expired runner token' })
  return runner
}

export function runnerRequestIp(event: any): string | null {
  try { return getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() || event?.node?.req?.socket?.remoteAddress || null } catch { return null }
}

/** Admin view: runner fleet health (no secrets — token hashes never returned). */
export async function listRunnerHealth(db: Pool = getPamDb()): Promise<any[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.name, r.description, r.enabled, r.status, r.connector_allowlist, r.max_concurrent_jobs,
            r.active_jobs, r.version, r.os, r.last_seen_at, r.last_ip, r.token_prefix, r.created_at, r.created_by,
            r.expires_at, r.rotated_at, r.revoked_at,
            (SELECT count(*)::int FROM pam.credential_jobs j WHERE j.assigned_runner_id = r.id AND j.status='running') AS running_jobs
       FROM pam.runners r ORDER BY r.created_at DESC`
  )
  return rows
}

// ── Runner identity management ────────────────────────────────────────────────

export interface CreateRunnerInput {
  name: string
  description?: string | null
  connectorAllowlist?: string[]
  maxConcurrentJobs?: number
  expiresAt?: string | null
  createdBy?: string
}

export async function createRunner(input: CreateRunnerInput, db: Pool = getPamDb()): Promise<{ id: string; token: string; tokenPrefix: string }> {
  const t: RunnerToken = generateRunnerToken()
  const id = newId()
  await db.query(
    `INSERT INTO pam.runners
      (id, name, description, token_hash, token_prefix, enabled, connector_allowlist, max_concurrent_jobs, status, created_at, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,'offline',$8,$9,$10)`,
    [id, input.name, input.description ?? null, t.tokenHash, t.tokenPrefix,
      input.connectorAllowlist ?? [], input.maxConcurrentJobs ?? 4, nowIso(), input.createdBy ?? 'system', input.expiresAt ?? null]
  )
  return { id, token: t.token, tokenPrefix: t.tokenPrefix }
}

export async function rotateRunnerToken(runnerId: string, db: Pool = getPamDb()): Promise<{ token: string; tokenPrefix: string } | null> {
  const t = generateRunnerToken()
  const { rowCount } = await db.query(
    'UPDATE pam.runners SET token_hash=$2, token_prefix=$3, rotated_at=$4 WHERE id=$1',
    [runnerId, t.tokenHash, t.tokenPrefix, nowIso()]
  )
  return rowCount ? { token: t.token, tokenPrefix: t.tokenPrefix } : null
}

export async function revokeRunner(runnerId: string, db: Pool = getPamDb()): Promise<void> {
  await db.query("UPDATE pam.runners SET enabled=false, status='revoked', revoked_at=$2 WHERE id=$1", [runnerId, nowIso()])
}

/** Resolve & validate the runner presenting `token`. Returns null (fail closed) if unknown/disabled/expired. */
export async function authenticateRunner(token: string | null, db: Pool = getPamDb()): Promise<any | null> {
  if (!token) return null
  const { rows } = await db.query('SELECT * FROM pam.runners WHERE token_hash=$1', [hashRunnerToken(token)])
  const r = rows[0]
  if (!r || !r.enabled || r.status === 'revoked') return null
  if (r.expires_at && Date.parse(r.expires_at) < Date.now()) return null
  return r
}

// ── Register / heartbeat / config ─────────────────────────────────────────────

export async function registerRunner(runner: any, meta: { version?: string; os?: string; capabilities?: unknown; ip?: string }, db: Pool = getPamDb()): Promise<any> {
  await db.query(
    "UPDATE pam.runners SET version=$2, os=$3, capabilities=$4, status='online', last_seen_at=$5, last_ip=$6 WHERE id=$1",
    [runner.id, meta.version ?? null, meta.os ?? null, meta.capabilities ? JSON.stringify(meta.capabilities) : null, nowIso(), meta.ip ?? null]
  )
  return runnerConfig({ ...runner, version: meta.version, os: meta.os }, db)
}

export async function heartbeat(runner: any, meta: { activeJobs?: number; status?: string; ip?: string }, db: Pool = getPamDb()): Promise<void> {
  const status = meta.status === 'draining' ? 'draining' : 'online'
  await db.query(
    'UPDATE pam.runners SET status=$2, active_jobs=$3, last_seen_at=$4, last_ip=COALESCE($5,last_ip) WHERE id=$1',
    [runner.id, status, Number(meta.activeJobs ?? 0), nowIso(), meta.ip ?? null]
  )
}

/** The runner's operating parameters + the connectors it is allowed to load, with expected digests. */
export async function runnerConfig(runner: any, db: Pool = getPamDb()): Promise<any> {
  const allow: string[] = runner.connector_allowlist ?? []
  const connectors = allow.length
    ? (await db.query(
        `SELECT connector_key, version, sha256, activation_status, enabled, trusted
           FROM pam.connectors
          WHERE connector_key = ANY($1) AND enabled=true AND trusted=true AND activation_status='active'`,
        [allow]
      )).rows
    : []
  return {
    runnerId: runner.id,
    pollIntervalMs: RUNNER_POLL_MS,
    leaseMs: RUNNER_LEASE_MS,
    maxConcurrentJobs: Number(runner.max_concurrent_jobs ?? 4),
    allowlist: allow,
    connectors: connectors.map((c: any) => ({ key: c.connector_key, version: c.version, sha256: c.sha256 }))
  }
}

// ── Connector-registry writes (signed) ────────────────────────────────────────

export interface ConnectorPackageInput {
  key: string
  name: string
  version: string
  sha256: string
  manifest?: unknown
  capabilities?: unknown
  configSchema?: unknown
  kind?: 'builtin' | 'custom'
  compatibility?: string | null
  uploadedBy?: string
}

/** Upsert a connector-registry entry and (re)compute its detached signature. */
export async function registerConnectorPackage(input: ConnectorPackageInput, db: Pool = getPamDb()): Promise<{ id: string; signature: string }> {
  if (!isSafeConnectorRef(input.key, input.version)) throw new Error('unsafe connector reference')
  const signature = signConnector({ key: input.key, version: input.version, sha256: input.sha256 }, connectorSigningKey())
  const existing = await db.query('SELECT id FROM pam.connectors WHERE connector_key=$1', [input.key])
  const id = existing.rows[0]?.id ?? newId()
  const now = nowIso()
  if (existing.rows.length) {
    await db.query(
      `UPDATE pam.connectors SET name=$2, version=$3, sha256=$4, manifest=$5, capabilities=$6, config_schema=$7,
              signature=$8, signing_key_id='env:NUXT_PAM_CONNECTOR_SIGNING_KEY', activation_status='active',
              compatibility=$9, uploaded_by=$10, updated_at=$11 WHERE id=$1`,
      [id, input.name, input.version, input.sha256, input.manifest ? JSON.stringify(input.manifest) : null,
        input.capabilities ? JSON.stringify(input.capabilities) : null, input.configSchema ? JSON.stringify(input.configSchema) : null,
        signature, input.compatibility ?? null, input.uploadedBy ?? 'system', now]
    )
  } else {
    await db.query(
      `INSERT INTO pam.connectors
        (id, connector_key, name, kind, version, config_schema, capabilities, signature, sha256, manifest,
         signing_key_id, activation_status, compatibility, security_review, trusted, enabled, uploaded_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'env:NUXT_PAM_CONNECTOR_SIGNING_KEY','active',$11,'approved',true,true,$12,$13,$13)`,
      [id, input.key, input.name, input.kind ?? 'builtin', input.version,
        input.configSchema ? JSON.stringify(input.configSchema) : null,
        input.capabilities ? JSON.stringify(input.capabilities) : null,
        signature, input.sha256, input.manifest ? JSON.stringify(input.manifest) : null,
        input.compatibility ?? null, input.uploadedBy ?? 'system', now]
    )
  }
  return { id, signature }
}

async function connectorRegistryEntry(key: string, db: Pool): Promise<ConnectorRegistryEntry | null> {
  const { rows } = await db.query('SELECT * FROM pam.connectors WHERE connector_key=$1', [key])
  const r = rows[0]
  if (!r) return null
  return {
    connector_key: r.connector_key, version: r.version, sha256: r.sha256, signature: r.signature,
    enabled: r.enabled, trusted: r.trusted, activation_status: r.activation_status, compatibility: r.compatibility, kind: r.kind
  }
}

// ── Job delegation ────────────────────────────────────────────────────────────

/** Decide whether a job should be executed in-process or delegated to a runner. */
export async function resolveJobHandler(accountId: string | null | undefined, platformId: string | null | undefined, db: Pool = getPamDb()): Promise<{ handler: 'in_process' | 'runner'; connectorKey: string | null }> {
  let platform: any = null
  if (platformId) {
    platform = (await db.query('SELECT connector_key, base_type FROM pam.platforms WHERE id=$1', [platformId])).rows[0] ?? null
  } else if (accountId) {
    const acct = (await db.query('SELECT platform_id FROM pam.accounts WHERE id=$1', [accountId])).rows[0]
    if (acct?.platform_id) platform = (await db.query('SELECT connector_key, base_type FROM pam.platforms WHERE id=$1', [acct.platform_id])).rows[0] ?? null
  }
  const connector = connectorForPlatform(platform)
  const connectorKey = connector?.key ?? null
  return { handler: connector && connector.runsInProcess === false ? 'runner' : 'in_process', connectorKey }
}

async function buildRunnerContext(account: any, platform: any, db: Pool): Promise<Record<string, unknown>> {
  const current = await openActiveCredential(account.id, db).catch(() => null)
  let logonCredential: string | null = null
  const { rows: links } = await db.query(
    "SELECT linked_account_id FROM pam.account_links WHERE account_id=$1 AND link_type='logon' LIMIT 1", [account.id]
  )
  if (links.length) {
    const logon = await openActiveCredential(links[0].linked_account_id, db).catch(() => null)
    logonCredential = logon?.value ?? null
  }
  const config = { ...(safeJson(platform?.change_procedure)), ...safeJson(account.custom_properties) }
  return {
    address: account.address ?? null,
    port: account.port ?? null,
    username: account.username,
    currentCredential: current?.value ?? null,
    logonCredential,
    config
  }
}

function safeJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown> } catch { return {} }
}

const JOB_TO_ACTION: Record<string, string> = {
  rotate: 'change', change: 'change', verify: 'verify', reconcile: 'reconcile',
  test_connection: 'test', discover: 'discover', unlock: 'unlock', enable: 'enable', disable: 'disable'
}

/** Reclaim runner jobs whose lease expired (owner died mid-flight). */
export async function reclaimExpiredRunnerLeases(db: Pool = getPamDb()): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE pam.credential_jobs
        SET status='queued', lease_owner=NULL, leased_at=NULL, lease_expires_at=NULL,
            assigned_runner_id=NULL, pending_secret=NULL, updated_at=$1
      WHERE status='running' AND handler='runner' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1`,
    [nowIso()]
  )
  return rowCount ?? 0
}

/** Claim one delegated job for this runner and return the executable context. */
export async function claimForRunner(runner: any, db: Pool = getPamDb()): Promise<any | null> {
  await reclaimExpiredRunnerLeases(db).catch(() => {})
  const allow: string[] = runner.connector_allowlist ?? []
  if (!allow.length) return null
  const now = nowIso()
  const leaseExpiry = new Date(Date.now() + RUNNER_LEASE_MS).toISOString()
  const { rows } = await db.query(
    `UPDATE pam.credential_jobs j
        SET status='running', lease_owner=$1, assigned_runner_id=$1, leased_at=$2, lease_expires_at=$3,
            started_at=COALESCE(j.started_at,$2), attempts=j.attempts+1, updated_at=$2
      WHERE j.id = (
        SELECT c.id FROM pam.credential_jobs c
         WHERE c.status='queued' AND c.handler='runner' AND c.run_after <= $2 AND c.cancel_requested=false
           AND c.connector_key = ANY($4)
           AND NOT EXISTS (
             SELECT 1 FROM pam.credential_jobs r
              WHERE r.status='running' AND r.concurrency_key IS NOT NULL
                AND r.concurrency_key = c.concurrency_key AND r.id <> c.id)
         ORDER BY c.priority ASC, c.run_after ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING j.*`,
    [runner.id, now, leaseExpiry, allow]
  )
  const job = rows[0]
  if (!job) return null

  // Load target + resolve the registry entry the runner must match.
  const account = job.account_id ? (await db.query('SELECT * FROM pam.accounts WHERE id=$1 AND deleted_at IS NULL', [job.account_id])).rows[0] : null
  const platform = account?.platform_id ? (await db.query('SELECT * FROM pam.platforms WHERE id=$1', [account.platform_id])).rows[0] : null
  const connectorKey = job.connector_key || connectorForPlatform(platform)?.key
  const regEntry = connectorKey ? await connectorRegistryEntry(connectorKey, db) : null

  let ctx: Record<string, unknown> = { config: {} }
  const action = JOB_TO_ACTION[job.job_type] ?? job.job_type
  if (account) {
    ctx = await buildRunnerContext(account, platform, db)
    // For a change/rotate the control plane generates the new credential and
    // seals it; the plaintext is delivered to the runner over this channel only.
    if (action === 'change') {
      const policy = safeJson(platform?.password_policy)
      const newCredential = generatePassword(policy as any, account.username)
      ctx.newCredential = newCredential
      await db.query('UPDATE pam.credential_jobs SET pending_secret=$2 WHERE id=$1', [job.id, JSON.stringify(seal(newCredential))])
    }
  }

  await appendRunnerLog(runner.id, job.id, 'info', `claimed ${job.job_type} (${connectorKey ?? 'no-connector'})`, db).catch(() => {})
  return {
    jobId: job.id,
    jobType: job.job_type,
    action,
    connector: regEntry ? { key: regEntry.connector_key, version: regEntry.version, sha256: regEntry.sha256, signature: regEntry.signature } : { key: connectorKey },
    ctx,
    leaseExpiresAt: leaseExpiry
  }
}

/** Idempotently apply a runner's structured result to a leased job. */
export async function reportForRunner(runner: any, jobId: string, result: ConnectorRunResult, db: Pool = getPamDb()): Promise<{ applied: boolean; idempotent?: boolean; ok?: boolean; detail?: string }> {
  const { rows } = await db.query('SELECT * FROM pam.credential_jobs WHERE id=$1', [jobId])
  const job = rows[0]
  if (!job) return { applied: false, detail: 'unknown job' }
  // Only the current lease-holder may report, and only while running. Late or
  // duplicate reports (after reclaim / prior report) are idempotent no-ops.
  if (job.status !== 'running' || job.assigned_runner_id !== runner.id) {
    return { applied: false, idempotent: true, detail: 'job not currently leased to this runner' }
  }

  // Runner-delegated discovery: populate the pending queue + finalize the run.
  if (job.job_type === 'discover') {
    const payload = (() => { try { return JSON.parse(job.payload || '{}') } catch { return {} } })()
    const accounts = Array.isArray((result as any).accounts) ? (result as any).accounts : []
    if (result.ok && payload.sourceId && payload.runId) {
      const { upsertDiscovered, applyRulesToRun } = await import('./pamDiscovery')
      const src = (await db.query('SELECT source_type FROM pam.discovery_sources WHERE id=$1', [payload.sourceId])).rows[0]
      const acct = job.account_id ? (await db.query('SELECT address FROM pam.accounts WHERE id=$1', [job.account_id])).rows[0] : null
      const counts = await upsertDiscovered(payload.sourceId, payload.runId, acct?.address ?? null, src?.source_type ?? 'unknown', accounts, db)
      const applied = await applyRulesToRun(payload.runId, `runner:${runner.id}`, db)
      await db.query("UPDATE pam.discovery_runs SET status='succeeded', finished_at=$2, accounts_found=$3, new_accounts=$4, changed_accounts=$5, progress=100 WHERE id=$1",
        [payload.runId, nowIso(), counts.total, counts.created, counts.changed])
      await db.query("UPDATE pam.discovery_sources SET last_status='succeeded' WHERE id=$1", [payload.sourceId])
      await db.query('UPDATE pam.credential_jobs SET assigned_runner_id=NULL WHERE id=$1', [jobId])
      await finalizeJob(job, { ok: true, detail: `discovered ${counts.total} (${counts.created} new)` }, `runner:${runner.id}`, db)
      return { applied: true, ok: true, detail: `discovered ${counts.total}`, ...applied }
    }
    if (payload.runId) await db.query("UPDATE pam.discovery_runs SET status='failed', finished_at=$2, error=$3 WHERE id=$1", [payload.runId, nowIso(), (result as any).detail || 'discover failed'])
    await db.query('UPDATE pam.credential_jobs SET assigned_runner_id=NULL WHERE id=$1', [jobId])
    await finalizeJob(job, { ok: false, detail: (result as any).detail || 'discover failed', terminal: !result.retryable }, `runner:${runner.id}`, db)
    return { applied: true, ok: false }
  }

  const decision = applyReportDecision({ job_type: job.job_type }, result)

  // Seal & activate the new credential only on a confirmed, verified change.
  if (decision.seal && job.pending_secret && job.account_id) {
    try {
      const plaintext = open(JSON.parse(job.pending_secret))
      await storeCredentialVersion({ accountId: job.account_id, plaintext, source: 'rotation', createdBy: `runner:${runner.id}` }, db)
      await db.query("UPDATE pam.accounts SET rotation_status='managed', last_verified=$2 WHERE id=$1", [job.account_id, nowIso()])
    } catch (e: any) {
      await appendRunnerLog(runner.id, jobId, 'error', `seal failed: ${redactLog(String(e?.message || e))}`, db).catch(() => {})
      await db.query('UPDATE pam.credential_jobs SET assigned_runner_id=NULL, pending_secret=NULL WHERE id=$1', [jobId])
      await finalizeJob(job, { ok: false, detail: 'target changed but sealing the new version failed — manual reconcile required', terminal: true }, `runner:${runner.id}`, db)
      return { applied: true, ok: false, detail: 'seal failed' }
    }
  }

  // Clear delegation scratch state, then finalize (records attempt + status).
  await db.query('UPDATE pam.credential_jobs SET assigned_runner_id=NULL, pending_secret=NULL, result=$2 WHERE id=$1',
    [jobId, JSON.stringify({ detail: decision.detail, evidence: result.evidence ?? null })])
  await finalizeJob(job, { ok: decision.ok, detail: decision.detail, terminal: decision.terminal }, `runner:${runner.id}`, db)
  await appendAudit({ actor: `runner:${runner.id}`, action: 'runner.job.report', objectType: 'credential_job', objectId: jobId, result: decision.ok ? 'success' : 'failure', severity: decision.ok ? 'notice' : 'high', reason: decision.detail }, db).catch(() => {})
  return { applied: true, ok: decision.ok, detail: decision.detail }
}

export async function appendRunnerLog(runnerId: string, jobId: string | null, level: string, message: string, db: Pool = getPamDb()): Promise<void> {
  await db.query(
    'INSERT INTO pam.runner_logs (id, runner_id, job_id, ts, level, message) VALUES ($1,$2,$3,$4,$5,$6)',
    [newId(), runnerId, jobId, nowIso(), level, redactLog(message).slice(0, 2000)]
  )
}

/**
 * Seed/refresh registry rows for runner-delegated connectors. When a bundle
 * manifest is available (PAM_CONNECTOR_MANIFEST, produced by
 * scripts/pam-publish-connectors.mjs), the REAL per-bundle SHA-256 is
 * registered + signed so the runner loads a bundle only when its local file
 * digest matches. Connectors without a shipped bundle fall back to a descriptor
 * digest (known, but the runner reports bundle_missing until a bundle ships).
 */
export async function seedRunnerConnectorRegistry(db: Pool = getPamDb()): Promise<number> {
  const { listConnectors } = await import('../connectors/registry')
  const { checksum } = await import('./pamCrypto')

  const bundleDigests = new Map<string, { version: string; sha256: string }>()
  const mpath = process.env.PAM_CONNECTOR_MANIFEST
  if (mpath) {
    try {
      const { readFileSync } = await import('node:fs')
      for (const e of JSON.parse(readFileSync(mpath, 'utf8')) as Array<{ key: string; version: string; sha256: string }>) {
        bundleDigests.set(e.key, { version: e.version, sha256: e.sha256 })
      }
    } catch (err: any) { console.warn('[pam:runner] connector manifest unreadable:', err?.message) }
  }

  const labels = new Map(listConnectors().map((c) => [c.key, c]))
  const seen = new Set<string>()
  let n = 0

  // Real bundles first (manifest = authoritative digest for the runner).
  for (const [key, { version, sha256 }] of bundleDigests) {
    const c = labels.get(key)
    await registerConnectorPackage({
      key, name: c?.label ?? key, version, sha256, kind: 'builtin',
      manifest: { key, version, source: 'bundle' }, capabilities: c?.capabilities, configSchema: c?.configSchema
    }, db)
    seen.add(key); n++
  }

  // Built-in runner connectors without a shipped bundle → descriptor digest.
  for (const c of listConnectors()) {
    if (c.runsInProcess || seen.has(c.key)) continue
    const version = c.version ?? '1.0.0'
    const manifest = { key: c.key, baseType: c.baseType, capabilities: c.capabilities, version }
    await registerConnectorPackage({
      key: c.key, name: c.label, version, sha256: checksum(JSON.stringify(manifest)), manifest,
      capabilities: c.capabilities, configSchema: c.configSchema, kind: 'builtin'
    }, db)
    n++
  }
  return n
}
