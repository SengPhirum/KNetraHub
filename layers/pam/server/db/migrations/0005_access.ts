import type { Migration } from './types'

/**
 * Access workflow: configurable approval policies and their rules, access
 * requests spanning one or many accounts, per-approver approval records
 * (sequential/parallel/multi-level), ticket-validation records, issued access
 * grants (time-bound), and just-in-time entitlements with automatic revocation
 * tracking.
 */
export const migration: Migration = {
  id: '0005_access',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.access_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      approval_type TEXT NOT NULL DEFAULT 'none' CHECK (approval_type IN (
        'none','one','any_of_group','all_selected','sequential','parallel',
        'multi_level','asset_owner','safe_owner','manager','security','risk_based',
        'ticket_only','approval_and_ticket')),
      require_ticket BOOLEAN NOT NULL DEFAULT false,
      require_mfa BOOLEAN NOT NULL DEFAULT false,
      require_recording BOOLEAN NOT NULL DEFAULT false,
      allow_self_approval BOOLEAN NOT NULL DEFAULT false,
      max_duration_minutes INTEGER NOT NULL DEFAULT 240,
      max_concurrent_sessions INTEGER NOT NULL DEFAULT 1,
      max_use_count INTEGER,
      allowed_protocols TEXT,
      allowed_source_networks TEXT,
      allowed_hours TEXT,
      separation_of_duties TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.access_policy_rules (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES pam.access_policies(id) ON DELETE CASCADE,
      level INTEGER NOT NULL DEFAULT 1,
      approver_type TEXT NOT NULL DEFAULT 'group',
      approver_ref TEXT,
      quorum INTEGER NOT NULL DEFAULT 1,
      timeout_minutes INTEGER,
      ordering INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_policy_rules_policy ON pam.access_policy_rules(policy_id, level, ordering)`,

    `CREATE TABLE IF NOT EXISTS pam.access_requests (
      id TEXT PRIMARY KEY,
      requester TEXT NOT NULL,
      requester_id TEXT,
      action TEXT NOT NULL DEFAULT 'connect' CHECK (action IN ('connect','use','reveal','rotate','administer')),
      protocol TEXT,
      reason TEXT NOT NULL,
      ticket_system TEXT,
      ticket_number TEXT,
      source_network TEXT,
      requested_command TEXT,
      start_at TEXT,
      expiry_at TEXT,
      max_duration_minutes INTEGER,
      recurring TEXT,
      attachment TEXT,
      emergency BOOLEAN NOT NULL DEFAULT false,
      policy_id TEXT REFERENCES pam.access_policies(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'draft','pending','approved','rejected','cancelled','expired','revoked')),
      decision_reason TEXT,
      current_level INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      decided_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_requests_status ON pam.access_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_requests_requester ON pam.access_requests(requester)`,

    `CREATE TABLE IF NOT EXISTS pam.request_accounts (
      request_id TEXT NOT NULL REFERENCES pam.access_requests(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      PRIMARY KEY (request_id, account_id)
    )`,

    `CREATE TABLE IF NOT EXISTS pam.request_approvals (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES pam.access_requests(id) ON DELETE CASCADE,
      level INTEGER NOT NULL DEFAULT 1,
      approver TEXT,
      approver_ref TEXT,
      decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected','delegated','expired')),
      comment TEXT,
      decided_at TEXT,
      delegated_to TEXT,
      delegate_expiry TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_request_approvals_req ON pam.request_approvals(request_id, level)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_request_approvals_pending ON pam.request_approvals(decision)`,

    `CREATE TABLE IF NOT EXISTS pam.request_tickets (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES pam.access_requests(id) ON DELETE CASCADE,
      ticket_system TEXT NOT NULL,
      ticket_number TEXT NOT NULL,
      validated BOOLEAN NOT NULL DEFAULT false,
      validation_status TEXT,
      validation_detail TEXT,
      validated_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_request_tickets_req ON pam.request_tickets(request_id)`,

    // A grant is the issued, time-bound authorization produced by an approved
    // request. Revoking a grant terminates any live session using it.
    `CREATE TABLE IF NOT EXISTS pam.access_grants (
      id TEXT PRIMARY KEY,
      request_id TEXT REFERENCES pam.access_requests(id) ON DELETE SET NULL,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      grantee TEXT NOT NULL,
      grantee_id TEXT,
      action TEXT NOT NULL DEFAULT 'connect',
      protocol TEXT,
      source_network TEXT,
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      max_use_count INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      max_concurrent_sessions INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','exhausted')),
      revoked_by TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      emergency BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_grants_grantee ON pam.access_grants(grantee, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_grants_account ON pam.access_grants(account_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_grants_expiry ON pam.access_grants(status, expires_at)`,

    // Just-in-time ephemeral entitlements (temp group membership, sudo, DB
    // role, K8s RoleBinding, cloud role session, etc.) with revocation tracking.
    `CREATE TABLE IF NOT EXISTS pam.jit_entitlements (
      id TEXT PRIMARY KEY,
      grant_id TEXT REFERENCES pam.access_grants(id) ON DELETE SET NULL,
      account_id TEXT REFERENCES pam.accounts(id) ON DELETE SET NULL,
      entitlement_type TEXT NOT NULL,
      target TEXT NOT NULL,
      principal TEXT NOT NULL,
      config TEXT,
      provisioned BOOLEAN NOT NULL DEFAULT false,
      provisioned_at TEXT,
      expires_at TEXT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false,
      revoked_at TEXT,
      revoke_attempts INTEGER NOT NULL DEFAULT 0,
      revoke_status TEXT NOT NULL DEFAULT 'pending' CHECK (revoke_status IN ('pending','revoked','failed','reconciled')),
      last_error TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jit_expiry ON pam.jit_entitlements(revoked, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jit_revoke_status ON pam.jit_entitlements(revoke_status)`
  ]
}
