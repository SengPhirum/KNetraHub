import type { Pool } from 'pg'
import type { JobType } from '../../shared/constants'

/**
 * Durable DB-backed job queue. Jobs are rows in monitoring.jobs; claiming
 * uses FOR UPDATE SKIP LOCKED with expiring leases so any number of app
 * instances / poller nodes cooperate without double-running work, and a
 * crashed worker's jobs are reaped when the lease expires.
 */

export interface JobRow {
  id: number
  type: JobType
  device_id: number | null
  poller_group: number
  payload: Record<string, unknown>
  priority: number
  attempts: number
  max_attempts: number
}

export async function enqueue(db: Pool, job: {
  type: JobType
  deviceId?: number | null
  pollerGroup?: number
  dedupeKey?: string
  payload?: Record<string, unknown>
  priority?: number
  runAt?: Date
  maxAttempts?: number
}): Promise<void> {
  await db.query(
    `INSERT INTO monitoring.jobs (type, device_id, poller_group, dedupe_key, payload, priority, run_at, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()),$8)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND state IN ('pending','running') DO NOTHING`,
    [job.type, job.deviceId ?? null, job.pollerGroup ?? 0, job.dedupeKey ?? null,
      JSON.stringify(job.payload ?? {}), job.priority ?? 100, job.runAt ?? null, job.maxAttempts ?? 3]
  )
}

/** Claim up to `limit` due jobs for this node (lease-based). */
export async function claim(db: Pool, nodeId: string, pollerGroup: number, limit: number, leaseSeconds = 600): Promise<JobRow[]> {
  const res = await db.query(
    `UPDATE monitoring.jobs SET
       state = 'running', locked_by = $1, lease_until = now() + make_interval(secs => $4),
       attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM monitoring.jobs
       WHERE state = 'pending' AND run_at <= now() AND poller_group = $2
       ORDER BY priority ASC, run_at ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, type, device_id, poller_group, payload, priority, attempts, max_attempts`,
    [nodeId, pollerGroup, limit, leaseSeconds]
  )
  return res.rows as JobRow[]
}

export async function complete(db: Pool, jobId: number): Promise<void> {
  await db.query(
    `UPDATE monitoring.jobs SET state = 'done', finished_at = now(), lease_until = NULL, last_error = NULL WHERE id = $1`,
    [jobId]
  )
}

/** Retry with exponential backoff, or dead-letter after max attempts. */
export async function fail(db: Pool, job: JobRow, error: string): Promise<void> {
  const message = error.slice(0, 2000)
  if (job.attempts >= job.max_attempts) {
    await db.query(
      `UPDATE monitoring.jobs SET state = 'dead', finished_at = now(), lease_until = NULL, last_error = $2 WHERE id = $1`,
      [job.id, message]
    )
    return
  }
  const backoffSeconds = Math.min(3600, 30 * Math.pow(2, job.attempts - 1))
  await db.query(
    `UPDATE monitoring.jobs SET state = 'pending', locked_by = NULL, lease_until = NULL,
       last_error = $2, run_at = now() + make_interval(secs => $3)
     WHERE id = $1`,
    [job.id, message, backoffSeconds]
  )
}

/** Recover jobs whose worker died (expired lease) — back to pending. */
export async function reapExpiredLeases(db: Pool): Promise<number> {
  const res = await db.query(
    `UPDATE monitoring.jobs SET state = 'pending', locked_by = NULL, lease_until = NULL,
       last_error = COALESCE(last_error, 'lease expired (worker lost)')
     WHERE state = 'running' AND lease_until < now()`
  )
  return res.rowCount ?? 0
}

/** Re-queue a dead-lettered job (operator action, audited by the API layer). */
export async function replayDead(db: Pool, jobId: number): Promise<boolean> {
  const res = await db.query(
    `UPDATE monitoring.jobs SET state = 'pending', attempts = 0, run_at = now(),
       locked_by = NULL, lease_until = NULL, finished_at = NULL
     WHERE id = $1 AND state IN ('dead','failed')`,
    [jobId]
  )
  return (res.rowCount ?? 0) > 0
}

/** Trim completed job rows (housekeeping). */
export async function trimFinishedJobs(db: Pool, keepDays: number): Promise<number> {
  const res = await db.query(
    `DELETE FROM monitoring.jobs WHERE state = 'done' AND finished_at < now() - make_interval(days => $1)`,
    [keepDays]
  )
  return res.rowCount ?? 0
}
