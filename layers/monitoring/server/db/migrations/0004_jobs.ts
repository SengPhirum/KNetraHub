import type { Migration } from './types'

/**
 * Polling infrastructure: poller-node registry, the durable job queue, and
 * the collection-completeness audit trail (poll runs → module runs →
 * per-item collection attempts).
 */
export const migration: Migration = {
  id: '0004_jobs',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.poller_nodes (
      id TEXT PRIMARY KEY,               -- stable node identity (hostname or configured name)
      poller_group INTEGER NOT NULL DEFAULT 0,
      version TEXT,
      started_at TIMESTAMPTZ,
      last_heartbeat_at TIMESTAMPTZ,
      worker_concurrency INTEGER,
      jobs_in_progress INTEGER NOT NULL DEFAULT 0,
      jobs_completed BIGINT NOT NULL DEFAULT 0,
      jobs_failed BIGINT NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true
    )`,

    // Durable job queue. Claiming uses FOR UPDATE SKIP LOCKED on pending rows;
    // dedupe_key prevents double-scheduling the same logical job.
    `CREATE TABLE IF NOT EXISTS monitoring.jobs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      type TEXT NOT NULL,                -- poll|discovery|services|alerts|housekeeping|billing
      device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      poller_group INTEGER NOT NULL DEFAULT 0,
      dedupe_key TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      priority INTEGER NOT NULL DEFAULT 100,   -- lower runs first
      state TEXT NOT NULL DEFAULT 'pending',   -- pending|running|done|failed|dead
      run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      locked_by TEXT,
      lease_until TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_jobs_dedupe ON monitoring.jobs (dedupe_key) WHERE dedupe_key IS NOT NULL AND state IN ('pending','running')`,
    `CREATE INDEX IF NOT EXISTS idx_mon_jobs_claim ON monitoring.jobs (state, poller_group, run_at, priority) WHERE state = 'pending'`,
    `CREATE INDEX IF NOT EXISTS idx_mon_jobs_lease ON monitoring.jobs (lease_until) WHERE state = 'running'`,
    `CREATE INDEX IF NOT EXISTS idx_mon_jobs_dead ON monitoring.jobs (state, finished_at DESC) WHERE state IN ('failed','dead')`,

    // One row per executed poll/discovery run — the collection-plan summary.
    `CREATE TABLE IF NOT EXISTS monitoring.poll_runs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      job_id BIGINT,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                -- poll|discovery|services
      poller_node TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running', -- running|complete|incomplete|failed
      -- collection plan (persisted before execution) and outcome roll-up
      plan JSONB NOT NULL DEFAULT '{}'::jsonb,
      planned_items INTEGER NOT NULL DEFAULT 0,
      succeeded_items INTEGER NOT NULL DEFAULT 0,
      empty_items INTEGER NOT NULL DEFAULT 0,
      unsupported_items INTEGER NOT NULL DEFAULT 0,
      skipped_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_poll_runs_device ON monitoring.poll_runs (device_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_poll_runs_status ON monitoring.poll_runs (status, started_at DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.module_runs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES monitoring.poll_runs(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      status TEXT NOT NULL,              -- success|empty|unsupported|skipped|failed
      skip_reason TEXT,
      error TEXT,
      duration_ms INTEGER,
      planned_items INTEGER NOT NULL DEFAULT 0,
      succeeded_items INTEGER NOT NULL DEFAULT 0,
      empty_items INTEGER NOT NULL DEFAULT 0,
      unsupported_items INTEGER NOT NULL DEFAULT 0,
      skipped_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_module_runs_run ON monitoring.module_runs (run_id)`,

    // Per-request outcome trail (hypertable; short retention). One row per
    // SNMP get/walk/command with its final CollectionOutcome — the
    // no-silent-loss audit surface.
    `CREATE TABLE IF NOT EXISTS monitoring.collection_attempts (
      time TIMESTAMPTZ NOT NULL DEFAULT now(),
      run_id BIGINT,
      device_id BIGINT,
      module TEXT NOT NULL,
      item TEXT NOT NULL,                -- OID / table name / command identifier
      outcome TEXT NOT NULL,             -- shared/constants COLLECTION_OUTCOMES
      detail TEXT,
      duration_ms INTEGER
    )`,
    `SELECT create_hypertable('monitoring.collection_attempts', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_attempts_device ON monitoring.collection_attempts (device_id, time DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_attempts_outcome ON monitoring.collection_attempts (outcome, time DESC)`
  ],
  tolerant: ['create_hypertable']
}
