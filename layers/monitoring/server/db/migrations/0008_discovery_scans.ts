import type { Migration } from './types'

/**
 * CIDR discovery scans: a scan probes a subnet and records candidates for
 * operator review — nothing is added to monitoring.devices until an operator
 * explicitly imports selected candidates. Also adds a `global` flag to jobs
 * so cluster-wide singleton work (alerts/services/billing/housekeeping) can
 * be claimed by any poller node regardless of its configured group, while
 * device-less-but-site-scoped jobs (like a subnet scan) still respect
 * poller_group.
 */
export const migration: Migration = {
  id: '0008_discovery_scans',
  statements: [
    `ALTER TABLE monitoring.jobs ADD COLUMN IF NOT EXISTS global BOOLEAN NOT NULL DEFAULT false`,

    `CREATE TABLE IF NOT EXISTS monitoring.discovery_scans (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cidr TEXT NOT NULL,
      poller_group INTEGER NOT NULL DEFAULT 0,
      credential_profile_id BIGINT REFERENCES monitoring.credential_profiles(id) ON DELETE SET NULL,
      exclude JSONB NOT NULL DEFAULT '[]'::jsonb,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',  -- running|done|failed
      total_hosts INTEGER NOT NULL DEFAULT 0,
      scanned_hosts INTEGER NOT NULL DEFAULT 0,
      alive_hosts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_disc_scans_created ON monitoring.discovery_scans (created_at DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.discovery_candidates (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      scan_id BIGINT NOT NULL REFERENCES monitoring.discovery_scans(id) ON DELETE CASCADE,
      ip INET NOT NULL,
      alive BOOLEAN NOT NULL DEFAULT false,
      rtt_ms DOUBLE PRECISION,
      already_exists BOOLEAN NOT NULL DEFAULT false,
      existing_device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE SET NULL,
      imported BOOLEAN NOT NULL DEFAULT false,
      imported_device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (scan_id, ip)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_disc_candidates_scan ON monitoring.discovery_candidates (scan_id, alive DESC, ip)`
  ]
}
