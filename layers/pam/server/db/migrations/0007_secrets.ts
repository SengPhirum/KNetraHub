import type { Migration } from './types'

/**
 * Secrets management for applications and workloads. Secrets carry only
 * metadata; each version's value is envelope-encrypted (same scheme as
 * credential_versions). Applications authenticate via one of several identity
 * methods and are authorized to specific secrets through secret_policies.
 */
export const migration: Migration = {
  id: '0007_secrets',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.secrets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      safe_id TEXT REFERENCES pam.safes(id) ON DELETE SET NULL,
      secret_type TEXT NOT NULL DEFAULT 'kv' CHECK (secret_type IN (
        'kv','json','db_credential','api_token','certificate','ssh_key','cloud_credential','password')),
      environment TEXT,
      description TEXT,
      tags TEXT,
      current_version INTEGER NOT NULL DEFAULT 0,
      rotation_interval_days INTEGER,
      expires_at TEXT,
      revoked BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT,
      deleted_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_secrets_path ON pam.secrets(lower(path)) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_pam_secrets_safe ON pam.secrets(safe_id)`,

    `CREATE TABLE IF NOT EXISTS pam.secret_versions (
      id TEXT PRIMARY KEY,
      secret_id TEXT NOT NULL REFERENCES pam.secrets(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      algo TEXT NOT NULL DEFAULT 'aes-256-gcm',
      key_version INTEGER NOT NULL,
      wrapped_dek TEXT NOT NULL,
      value_ciphertext TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      created_by TEXT,
      retired_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_secret_versions_uq ON pam.secret_versions(secret_id, version)`,

    `CREATE TABLE IF NOT EXISTS pam.applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      environment TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_applications_slug ON pam.applications(lower(slug))`,

    // Identity methods an application uses to authenticate to the secrets API.
    // For token auth we store ONLY the hash of the token, never the token.
    `CREATE TABLE IF NOT EXISTS pam.application_identities (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES pam.applications(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK (method IN (
        'oidc_workload','k8s_sa','mtls','signed_jwt','swarm_service','api_token','cloud_workload','host')),
      name TEXT NOT NULL,
      matcher TEXT,
      token_hash TEXT,
      token_prefix TEXT,
      allowed_source_networks TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      expires_at TEXT,
      last_used TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_app_identities_app ON pam.application_identities(application_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_app_identities_token ON pam.application_identities(token_hash) WHERE token_hash IS NOT NULL`,

    // Which application may read which secrets, and how (lease TTL, one-time).
    `CREATE TABLE IF NOT EXISTS pam.secret_policies (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES pam.applications(id) ON DELETE CASCADE,
      secret_id TEXT REFERENCES pam.secrets(id) ON DELETE CASCADE,
      path_pattern TEXT,
      capabilities TEXT NOT NULL DEFAULT 'read',
      lease_ttl_seconds INTEGER NOT NULL DEFAULT 300,
      one_time BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_secret_policies_app ON pam.secret_policies(application_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_secret_policies_secret ON pam.secret_policies(secret_id)`
  ]
}
