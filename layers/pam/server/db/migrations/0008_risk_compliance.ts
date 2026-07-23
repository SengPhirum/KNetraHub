import type { Migration } from './types'

/**
 * Privileged threat analytics (explainable rules + events), access
 * certification campaigns, saved reports and schedules, policy exceptions, the
 * connector registry/instances/health, and external-vendor access.
 */
export const migration: Migration = {
  id: '0008_risk_compliance',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.risk_rules (
      id TEXT PRIMARY KEY,
      rule_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      config TEXT,
      auto_response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_risk_rules_key ON pam.risk_rules(rule_key)`,

    `CREATE TABLE IF NOT EXISTS pam.risk_events (
      id TEXT PRIMARY KEY,
      rule_key TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      confidence INTEGER NOT NULL DEFAULT 50,
      actor TEXT,
      account_id TEXT,
      target TEXT,
      session_id TEXT,
      request_id TEXT,
      evidence TEXT,
      explanation TEXT,
      recommended_action TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
      assignee TEXT,
      resolution TEXT,
      auto_response_taken TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      resolved_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_risk_events_status ON pam.risk_events(status, severity)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_risk_events_created ON pam.risk_events(created_at DESC)`,

    `CREATE TABLE IF NOT EXISTS pam.certification_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT,
      reviewer TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','overdue')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.certification_items (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES pam.certification_campaigns(id) ON DELETE CASCADE,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_label TEXT,
      decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','certified','revoked','delegated')),
      comment TEXT,
      reviewer TEXT,
      decided_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_cert_items_campaign ON pam.certification_items(campaign_id, decision)`,

    `CREATE TABLE IF NOT EXISTS pam.reports (
      id TEXT PRIMARY KEY,
      report_key TEXT NOT NULL,
      name TEXT NOT NULL,
      params TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.report_schedules (
      id TEXT PRIMARY KEY,
      report_key TEXT NOT NULL,
      params TEXT,
      interval_seconds INTEGER NOT NULL DEFAULT 604800,
      channel TEXT,
      format TEXT NOT NULL DEFAULT 'csv',
      enabled BOOLEAN NOT NULL DEFAULT true,
      next_run_at TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.policy_exceptions (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      reason TEXT NOT NULL,
      approved_by TEXT,
      expires_at TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_policy_exceptions_scope ON pam.policy_exceptions(scope_type, scope_id, active)`,

    `CREATE TABLE IF NOT EXISTS pam.connectors (
      id TEXT PRIMARY KEY,
      connector_key TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'builtin' CHECK (kind IN ('builtin','custom')),
      version TEXT NOT NULL DEFAULT '1.0.0',
      config_schema TEXT,
      capabilities TEXT,
      signature TEXT,
      trusted BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_connectors_key ON pam.connectors(connector_key)`,

    `CREATE TABLE IF NOT EXISTS pam.connector_versions (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL REFERENCES pam.connectors(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      definition TEXT,
      signature TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_connector_versions_uq ON pam.connector_versions(connector_id, version)`,

    `CREATE TABLE IF NOT EXISTS pam.connector_instances (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL REFERENCES pam.connectors(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      config TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.connector_health (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL REFERENCES pam.connectors(id) ON DELETE CASCADE,
      instance_id TEXT,
      status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','offline','unknown')),
      detail TEXT,
      reported_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_connector_health ON pam.connector_health(connector_id, reported_at DESC)`,

    `CREATE TABLE IF NOT EXISTS pam.vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sponsor TEXT,
      contract_start TEXT,
      contract_end TEXT,
      allowed_countries TEXT,
      allowed_networks TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired')),
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.vendor_users (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL REFERENCES pam.vendors(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      display_name TEXT,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended','expired')),
      mfa_verified BOOLEAN NOT NULL DEFAULT false,
      terms_accepted_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_vendor_users_vendor ON pam.vendor_users(vendor_id)`,

    `CREATE TABLE IF NOT EXISTS pam.vendor_invitations (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL REFERENCES pam.vendors(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','expired','revoked')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      accepted_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_vendor_invites_vendor ON pam.vendor_invitations(vendor_id)`
  ]
}
