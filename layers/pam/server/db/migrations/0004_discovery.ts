import type { Migration } from './types'

/**
 * Privileged-account discovery and rule-based onboarding: sources (AD, hosts,
 * network ranges, IPAM/Monitoring assets, cloud, CSV/API), their schedules and
 * run history, the pending discovered-account queue with deltas, and the
 * conditional onboarding-rule engine.
 */
export const migration: Migration = {
  id: '0004_discovery',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.discovery_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      config TEXT,
      credential_account_id TEXT REFERENCES pam.accounts(id) ON DELETE SET NULL,
      include_scopes TEXT,
      exclude_scopes TEXT,
      rate_limit INTEGER,
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_run_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_disc_sources_type ON pam.discovery_sources(source_type)`,

    `CREATE TABLE IF NOT EXISTS pam.discovery_schedules (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES pam.discovery_sources(id) ON DELETE CASCADE,
      interval_seconds INTEGER NOT NULL DEFAULT 86400,
      maintenance_window_id TEXT REFERENCES pam.maintenance_windows(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      next_run_at TEXT,
      created_at TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS pam.discovery_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES pam.discovery_sources(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','cancelled')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      accounts_found INTEGER NOT NULL DEFAULT 0,
      new_accounts INTEGER NOT NULL DEFAULT 0,
      changed_accounts INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      actor TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_disc_runs_source ON pam.discovery_runs(source_id, started_at DESC)`,

    `CREATE TABLE IF NOT EXISTS pam.discovered_accounts (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES pam.discovery_sources(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES pam.discovery_runs(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      address TEXT,
      os_type TEXT,
      account_type TEXT,
      privileged_group TEXT,
      environment TEXT,
      password_age_days INTEGER,
      non_expiring BOOLEAN,
      dormant BOOLEAN,
      shared BOOLEAN,
      is_duplicate BOOLEAN,
      dependency_count INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','onboarded','ignored','review')),
      onboarded_account_id TEXT REFERENCES pam.accounts(id) ON DELETE SET NULL,
      matched_rule_id TEXT,
      details TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_disc_accounts_status ON pam.discovered_accounts(status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_disc_accounts_fp ON pam.discovered_accounts(fingerprint) WHERE fingerprint IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS pam.onboarding_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      conditions TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'onboard' CHECK (action IN ('onboard','review','ignore')),
      assign_safe_id TEXT REFERENCES pam.safes(id) ON DELETE SET NULL,
      assign_platform_id TEXT REFERENCES pam.platforms(id) ON DELETE SET NULL,
      assign_owner TEXT,
      assign_tags TEXT,
      auto_manage BOOLEAN NOT NULL DEFAULT false,
      trigger_reconcile BOOLEAN NOT NULL DEFAULT false,
      create_approval BOOLEAN NOT NULL DEFAULT false,
      ignore_reason TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_onboarding_rules_prio ON pam.onboarding_rules(enabled, priority)`
  ]
}
