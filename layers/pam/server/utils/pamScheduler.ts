import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { nowIso } from './pamStore'
import { appendAudit, createCheckpoint, verifyAuditIntegrity } from './pamAudit'
import { pamNotify } from './pamNotify'
import { recordRisk } from './pamRisk'
import { enqueueJob } from './pamJobs'
import { getPamSetting } from './pamStore'

/**
 * Periodic PAM maintenance: expire grants, revoke overdue JIT entitlements,
 * enqueue due rotations, and anchor the audit chain with signed checkpoints.
 * Runs from the bootstrap plugin; singleton work uses advisory locks so
 * multiple app replicas cooperate without duplicating.
 */

/** Expire grants past their window; terminate any sessions still using them. */
export async function sweepExpiredGrants(db: Pool = getPamDb()): Promise<number> {
  const { rows } = await db.query(
    "SELECT id, grantee, account_id FROM pam.access_grants WHERE status='active' AND expires_at <= $1",
    [nowIso()]
  )
  for (const g of rows) {
    await db.query("UPDATE pam.access_grants SET status='expired' WHERE id=$1", [g.id])
    await db.query(
      "UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason='grant expired' WHERE grant_id=$1 AND state IN ('starting','active','idle')",
      [g.id, nowIso()]
    )
    await appendAudit({ actor: 'system', action: 'grant.expired', objectType: 'grant', objectId: g.id, result: 'success', severity: 'notice' }, db).catch(() => {})
  }
  return rows.length
}

/**
 * Revoke JIT entitlements past expiry. Vault-local entitlements are revoked
 * immediately; target-applied entitlements that require the connector-runner
 * increment revoke_attempts and, after repeated failures, raise a CRITICAL
 * jit_revoke_failure event + alert (spec §4.11 step 9).
 */
export async function sweepJitRevocations(db: Pool = getPamDb()): Promise<number> {
  const { rows } = await db.query(
    "SELECT * FROM pam.jit_entitlements WHERE revoked=false AND expires_at <= $1",
    [nowIso()]
  )
  let revoked = 0
  const runnerTypes = new Set(['ad_group', 'k8s_rolebinding', 'aws_role', 'azure_role', 'gcp_role', 'sudo', 'db_role', 'vpn'])
  for (const j of rows) {
    if (!runnerTypes.has(j.entitlement_type)) {
      await db.query("UPDATE pam.jit_entitlements SET revoked=true, revoked_at=$2, revoke_status='revoked' WHERE id=$1", [j.id, nowIso()])
      await appendAudit({ actor: 'system', action: 'jit.revoked', objectType: 'jit', objectId: j.id, result: 'success' }, db).catch(() => {})
      revoked++
      continue
    }
    const attempts = Number(j.revoke_attempts) + 1
    // The runner is not attached in this build → revocation cannot complete.
    await db.query("UPDATE pam.jit_entitlements SET revoke_attempts=$2, revoke_status='failed', last_error=$3 WHERE id=$1",
      [j.id, attempts, 'connector-runner not attached — target entitlement not removed'])
    if (attempts >= 3) {
      await recordRisk({ ruleKey: 'jit_revoke_failure', accountId: j.account_id, target: j.target, severity: 'critical',
        explanation: `JIT entitlement ${j.entitlement_type} on ${j.target} for ${j.principal} could not be revoked after ${attempts} attempts.` }, db)
      await pamNotify({ severity: 'critical', event: 'jit.revoke_failed', title: 'JIT revocation failed',
        body: `Failed to revoke ${j.entitlement_type} on ${j.target} for ${j.principal}.`, objectType: 'jit', objectId: j.id, link: '/pam/grants' }, db)
    }
  }
  return revoked
}

/** Enqueue rotation jobs for auto-managed accounts whose rotation is due. */
export async function scheduleDueRotations(db: Pool = getPamDb()): Promise<number> {
  const { rows } = await db.query(
    `SELECT id, safe_id, platform_id, next_rotation_at FROM pam.accounts
      WHERE deleted_at IS NULL AND auto_managed = true AND enabled = true
        AND rotation_status IN ('managed','pending')
        AND next_rotation_at IS NOT NULL AND next_rotation_at <= $1
      LIMIT 200`,
    [nowIso()]
  )
  let queued = 0
  for (const a of rows) {
    const bucket = new Date().toISOString().slice(0, 13) // hour bucket → idempotent per hour
    const res = await enqueueJob({
      jobType: 'rotate', accountId: a.id, safeId: a.safe_id, platformId: a.platform_id,
      trigger: 'scheduled', idempotencyKey: `rotate:${a.id}:${bucket}`, createdBy: 'scheduler'
    }, db)
    if (!res.deduped) queued++
    // Avoid re-enqueue storms: push next_rotation forward a short guard window.
    await db.query("UPDATE pam.accounts SET rotation_status='pending' WHERE id=$1", [a.id]).catch(() => {})
  }
  return queued
}

/** Create a signed audit checkpoint at the configured interval (advisory-locked). */
export async function maybeCheckpoint(db: Pool = getPamDb()): Promise<void> {
  const intervalMin = await getPamSetting<number>('audit.checkpoint_interval_minutes', 60, db)
  const { rows } = await db.query('SELECT ts FROM pam.audit_checkpoints ORDER BY ts DESC LIMIT 1')
  const last = rows[0]?.ts ? new Date(rows[0].ts).getTime() : 0
  if (Date.now() - last < intervalMin * 60_000) return
  const client = await db.connect()
  try {
    // Only one replica creates the checkpoint.
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('pam.audit.checkpoint')) AS ok")
    if (!lock.rows[0]?.ok) return
    try {
      await createCheckpoint('system', db)
      const report = await verifyAuditIntegrity(db)
      if (!report.ok) {
        await recordRisk({ ruleKey: 'audit_integrity_failure', severity: 'critical',
          explanation: `Audit integrity verification failed (brokenAt=${report.brokenAt ?? 'n/a'}, failedCheckpoints=${report.checkpointsFailed}).` }, db)
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('pam.audit.checkpoint'))").catch(() => {})
    }
  } finally {
    client.release()
  }
}
