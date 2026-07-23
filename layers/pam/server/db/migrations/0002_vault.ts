import type { Migration } from './types'

/**
 * The secured vault: safes and their granular membership, platforms and their
 * versioned definitions/actions, privileged accounts (never storing plaintext),
 * account properties/dependencies/links, envelope-encrypted credential
 * versions, credential leases, and the soft-delete recovery area.
 */
export const migration: Migration = {
  id: '0002_vault',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.safes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      business_owner TEXT,
      technical_owner TEXT,
      department TEXT,
      environment TEXT NOT NULL DEFAULT 'production',
      criticality TEXT NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low','medium','high','critical')),
      data_classification TEXT,
      retention_days INTEGER NOT NULL DEFAULT 365,
      default_platform_id TEXT,
      approval_policy_id TEXT,
      recording_policy TEXT,
      rotation_policy TEXT,
      require_dual_control BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','locked')),
      row_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT,
      deleted_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_safes_slug ON pam.safes(lower(slug)) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_pam_safes_status ON pam.safes(status)`,

    `CREATE TABLE IF NOT EXISTS pam.safe_members (
      id TEXT PRIMARY KEY,
      safe_id TEXT NOT NULL REFERENCES pam.safes(id) ON DELETE CASCADE,
      principal_type TEXT NOT NULL CHECK (principal_type IN ('user','group')),
      principal_id TEXT NOT NULL,
      principal_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'local',
      added_at TEXT NOT NULL,
      added_by TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_safe_members_uq ON pam.safe_members(safe_id, principal_type, lower(principal_id))`,
    `CREATE INDEX IF NOT EXISTS idx_pam_safe_members_safe ON pam.safe_members(safe_id)`,

    `CREATE TABLE IF NOT EXISTS pam.safe_member_permissions (
      member_id TEXT NOT NULL REFERENCES pam.safe_members(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      PRIMARY KEY (member_id, permission)
    )`,

    `CREATE TABLE IF NOT EXISTS pam.platforms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      base_type TEXT NOT NULL,
      connector_key TEXT,
      connection_methods TEXT,
      credential_format TEXT,
      password_policy TEXT,
      change_procedure TEXT,
      verify_procedure TEXT,
      reconcile_procedure TEXT,
      discovery_behavior TEXT,
      session_policy TEXT,
      recording_policy TEXT,
      access_workflow_id TEXT,
      allowed_safes TEXT,
      required_properties TEXT,
      linked_account_rules TEXT,
      dependent_rules TEXT,
      retry_timeout TEXT,
      builtin BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      row_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_platforms_slug ON pam.platforms(lower(slug))`,

    `CREATE TABLE IF NOT EXISTS pam.platform_versions (
      id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL REFERENCES pam.platforms(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      definition TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_platform_versions_uq ON pam.platform_versions(platform_id, version)`,

    `CREATE TABLE IF NOT EXISTS pam.platform_actions (
      platform_id TEXT NOT NULL REFERENCES pam.platforms(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      config TEXT,
      PRIMARY KEY (platform_id, action)
    )`,

    `CREATE TABLE IF NOT EXISTS pam.accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      address TEXT,
      port INTEGER,
      safe_id TEXT NOT NULL REFERENCES pam.safes(id) ON DELETE RESTRICT,
      platform_id TEXT REFERENCES pam.platforms(id) ON DELETE SET NULL,
      environment TEXT,
      owner TEXT,
      account_type TEXT NOT NULL DEFAULT 'generic',
      privilege_level TEXT,
      criticality TEXT NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low','medium','high','critical')),
      rotation_status TEXT NOT NULL DEFAULT 'unmanaged' CHECK (rotation_status IN ('unmanaged','managed','pending','failed','disabled')),
      auto_managed BOOLEAN NOT NULL DEFAULT false,
      last_verified TEXT,
      last_changed TEXT,
      last_reconciled TEXT,
      last_used TEXT,
      next_rotation_at TEXT,
      checkout_state TEXT NOT NULL DEFAULT 'available' CHECK (checkout_state IN ('available','checked_out','locked')),
      dependency_count INTEGER NOT NULL DEFAULT 0,
      risk_score INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      discovery_source TEXT,
      custom_properties TEXT,
      current_credential_version INTEGER,
      ipam_address_id TEXT,
      monitoring_device_id TEXT,
      notes TEXT,
      row_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT,
      deleted_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_accounts_safe ON pam.accounts(safe_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_pam_accounts_platform ON pam.accounts(platform_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_accounts_type ON pam.accounts(account_type)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_accounts_rotation ON pam.accounts(rotation_status, next_rotation_at)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_accounts_search ON pam.accounts(lower(name), lower(username))`,

    `CREATE TABLE IF NOT EXISTS pam.account_properties (
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (account_id, key)
    )`,

    `CREATE TABLE IF NOT EXISTS pam.account_dependencies (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      dependency_type TEXT NOT NULL,
      target TEXT NOT NULL,
      config TEXT,
      last_status TEXT,
      last_updated TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_account_deps_acct ON pam.account_dependencies(account_id)`,

    `CREATE TABLE IF NOT EXISTS pam.account_links (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      linked_account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL CHECK (link_type IN ('logon','reconcile','elevation','dependent')),
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_account_links_uq ON pam.account_links(account_id, linked_account_id, link_type)`,

    // Envelope-encrypted credential material. value_ciphertext and wrapped_dek
    // are the ONLY places a secret ever lives, and both are ciphertext. No
    // plaintext, no key, no reversible checksum is stored (see pamCrypto.ts).
    `CREATE TABLE IF NOT EXISTS pam.credential_versions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'password',
      algo TEXT NOT NULL DEFAULT 'aes-256-gcm',
      key_version INTEGER NOT NULL,
      wrapped_dek TEXT NOT NULL,
      value_ciphertext TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      source TEXT NOT NULL DEFAULT 'manual',
      verified_at TEXT,
      verify_result TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT,
      retired_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_cred_versions_uq ON pam.credential_versions(account_id, version)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_cred_versions_active ON pam.credential_versions(account_id, active)`,

    `CREATE TABLE IF NOT EXISTS pam.credential_leases (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES pam.accounts(id) ON DELETE CASCADE,
      credential_version INTEGER,
      lessee TEXT NOT NULL,
      lease_type TEXT NOT NULL CHECK (lease_type IN ('reveal','use','session','application')),
      request_id TEXT,
      session_id TEXT,
      source_ip TEXT,
      one_time BOOLEAN NOT NULL DEFAULT false,
      consumed BOOLEAN NOT NULL DEFAULT false,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      returned_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_cred_leases_acct ON pam.credential_leases(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_cred_leases_expires ON pam.credential_leases(expires_at)`,

    // Soft-delete recovery. payload is a metadata snapshot for restore; secret
    // material is NOT copied here (credential_versions rows are retained under
    // the account until purge, or re-wrapped on recovery).
    `CREATE TABLE IF NOT EXISTS pam.deleted_objects (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      safe_id TEXT,
      payload TEXT NOT NULL,
      recoverable BOOLEAN NOT NULL DEFAULT true,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT,
      recovered_at TEXT,
      recovered_by TEXT,
      purge_after TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_deleted_objects_type ON pam.deleted_objects(object_type, recoverable)`
  ]
}
