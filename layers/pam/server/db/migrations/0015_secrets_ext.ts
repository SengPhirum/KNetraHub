import type { Migration } from './types'

/**
 * Secrets lifecycle extensions: a dedicated secret-lease table (the prior code
 * mis-used credential_leases with account_id=secret.id, which violated the FK
 * and was silently swallowed — so leases were never recorded/enforced), plus
 * dynamic-secret config. Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0015_secrets_ext',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.secret_leases (
      id TEXT PRIMARY KEY,
      secret_id TEXT NOT NULL REFERENCES pam.secrets(id) ON DELETE CASCADE,
      application_id TEXT,
      version INTEGER,
      lessee TEXT NOT NULL,
      one_time BOOLEAN NOT NULL DEFAULT false,
      ttl_seconds INTEGER NOT NULL DEFAULT 300,
      dynamic BOOLEAN NOT NULL DEFAULT false,
      source_ip TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_secret_leases_secret ON pam.secret_leases(secret_id, application_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_secret_leases_expires ON pam.secret_leases(expires_at)`,

    `ALTER TABLE pam.secrets ADD COLUMN IF NOT EXISTS dynamic BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE pam.secrets ADD COLUMN IF NOT EXISTS dynamic_config TEXT`
  ]
}
