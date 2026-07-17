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
  /** Cluster-wide singleton work (alerts/services/billing/housekeeping): claimable by any node regardless of poller_group. */
  global?: boolean
  dedupeKey?: string
  payload?: Record<string, unknown>
  priority?: number
  runAt?: Date
  maxAttempts?: number
}): Promise<void> {
  await db.query(
    `INSERT INTO monitoring.jobs (type, device_id, poller_group, global, dedupe_key, payload, priority, run_at, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()),$9)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND state IN ('pending','running') DO NOTHING`,
    [job.type, job.deviceId ?? null, job.pollerGroup ?? 0, !!job.global, job.dedupeKey ?? null,
      JSON.stringify(job.payload ?? {}), job.priority ?? 100, job.runAt ?? null, job.maxAttempts ?? 3]
  )
}

/**
 * Claim up to `limit` due jobs for this node (lease-based). Most jobs
 * (poll/discovery/discovery_scan) are pinned to a poller_group — device jobs
 * to the device's group, subnet scans to the group the operator targeted, so
 * they run from a node that can actually reach that site. Jobs marked
 * `global` (cluster-wide singletons: alerts/services/billing/housekeeping)
 * are claimable by any node regardless of its configured group — a
 * deployment where every node has a dedicated non-zero group would otherwise
 * never have anyone claim group-0 work. FOR UPDATE SKIP LOCKED still
 * guarantees only one node wins each row.
 */
export async function claim(db: Pool, nodeId: string, pollerGroup: number, limit: number, leaseSeconds = 600): Promise<JobRow[]> {
  const res = await db.query(
    `UPDATE monitoring.jobs SET
       state = 'running', locked_by = $1, lease_until = now() + make_interval(secs => $4),
       attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM monitoring.jobs
       WHERE state = 'pending' AND run_at <= now() AND (poller_group = $2 OR global)
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

/**
 * Force a job to run now (operator action, audited by the API layer).
 * Also re-syncs poller_group from the device's current value, so a job
 * stuck pending under a stale/wrong poller_group (e.g. the device's group
 * changed, or was mis-queued) moves to the group that can actually claim it
 * instead of being reset back into the same dead end.
 *
 * Reviving a dead/failed job can race a fresh pending job the dispatcher
 * already re-enqueued under the same dedupe_key (the partial unique index
 * only covers pending/running, so a dead row doesn't block a new insert) —
 * that's reported as 'conflict' rather than an unhandled 23505 crash.
 */
export async function replayJob(db: Pool, jobId: number): Promise<'ok' | 'not_found' | 'conflict'> {
  try {
    const res = await db.query(
      `UPDATE monitoring.jobs SET state = 'pending', attempts = 0, run_at = now(),
         locked_by = NULL, lease_until = NULL, finished_at = NULL, last_error = NULL,
         poller_group = COALESCE((SELECT poller_group FROM monitoring.devices WHERE id = monitoring.jobs.device_id), poller_group)
       WHERE id = $1 AND state IN ('dead','failed','pending')`,
      [jobId]
    )
    return (res.rowCount ?? 0) > 0 ? 'ok' : 'not_found'
  } catch (err: any) {
    if (err?.code === '23505') return 'conflict'
    throw err
  }
}

/** Trim completed job rows (housekeeping). */
export async function trimFinishedJobs(db: Pool, keepDays: number): Promise<number> {
  const res = await db.query(
    `DELETE FROM monitoring.jobs WHERE state = 'done' AND finished_at < now() - make_interval(days => $1)`,
    [keepDays]
  )
  return res.rowCount ?? 0
}
