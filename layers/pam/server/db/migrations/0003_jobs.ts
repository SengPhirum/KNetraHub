import type { Migration } from './types'

/**
 * PostgreSQL-backed durable job queue for the credential lifecycle worker.
 * Jobs are claimed with FOR UPDATE SKIP LOCKED under a lease; concurrency_key
 * serializes work against the same target/account; idempotency_key dedupes
 * enqueue; retries use exponential backoff up to max_attempts before moving to
 * the dead-letter state. Every attempt is recorded for the job-history view.
 */
export const migration: Migration = {
  id: '0003_jobs',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.credential_jobs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL CHECK (job_type IN (
        'rotate','verify','reconcile','change','unlock','enable','disable',
        'test_connection','discover','update_dependencies','revoke_grant','purge')),
      account_id TEXT REFERENCES pam.accounts(id) ON DELETE CASCADE,
      safe_id TEXT,
      platform_id TEXT,
      concurrency_key TEXT,
      idempotency_key TEXT,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','running','succeeded','failed','dead','cancelled')),
      priority INTEGER NOT NULL DEFAULT 100,
      trigger TEXT NOT NULL DEFAULT 'manual',
      run_after TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      lease_owner TEXT,
      leased_at TEXT,
      lease_expires_at TEXT,
      cancel_requested BOOLEAN NOT NULL DEFAULT false,
      maintenance_window_id TEXT,
      payload TEXT,
      result TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT,
      updated_at TEXT,
      started_at TEXT,
      finished_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_jobs_idem ON pam.credential_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    // The claim query orders queued/failed jobs by priority then run_after.
    `CREATE INDEX IF NOT EXISTS idx_pam_jobs_claim ON pam.credential_jobs(status, priority, run_after)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jobs_account ON pam.credential_jobs(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jobs_concurrency ON pam.credential_jobs(concurrency_key, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jobs_lease ON pam.credential_jobs(status, lease_expires_at)`,

    `CREATE TABLE IF NOT EXISTS pam.credential_job_attempts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES pam.credential_jobs(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL,
      worker TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error TEXT,
      detail TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_job_attempts_job ON pam.credential_job_attempts(job_id, attempt)`,

    `CREATE TABLE IF NOT EXISTS pam.maintenance_windows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      starts_at TEXT,
      ends_at TEXT,
      recurrence TEXT,
      safe_id TEXT REFERENCES pam.safes(id) ON DELETE CASCADE,
      platform_id TEXT REFERENCES pam.platforms(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_maint_windows_enabled ON pam.maintenance_windows(enabled)`
  ]
}
