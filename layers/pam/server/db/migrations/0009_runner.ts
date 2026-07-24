import type { Migration } from './types'

/**
 * Runner control plane: runner identities (hashed tokens, per-runner connector
 * allowlist, expiry/rotation), redacted runner logs, credential-job delegation
 * columns (handler=in_process|runner, the resolved connector_key, an assigned
 * runner, and a sealed pending credential awaiting runner-confirmed change), and
 * connector-registry hardening columns (sha256 digest, manifest, signature key
 * id, activation status, compatibility, security review). Forward-only,
 * idempotent — every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
export const migration: Migration = {
  id: '0009_runner',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.runners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      token_hash TEXT NOT NULL,
      token_prefix TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      connector_allowlist TEXT[] NOT NULL DEFAULT '{}',
      capabilities TEXT,
      max_concurrent_jobs INTEGER NOT NULL DEFAULT 4,
      version TEXT,
      os TEXT,
      status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','online','draining','revoked')),
      active_jobs INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      last_ip TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT,
      expires_at TEXT,
      rotated_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_runners_token ON pam.runners(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_runners_status ON pam.runners(enabled, status)`,

    `CREATE TABLE IF NOT EXISTS pam.runner_logs (
      id TEXT PRIMARY KEY,
      runner_id TEXT REFERENCES pam.runners(id) ON DELETE CASCADE,
      job_id TEXT,
      ts TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_runner_logs ON pam.runner_logs(runner_id, ts DESC)`,

    // ── credential_jobs delegation columns ────────────────────────────────────
    `ALTER TABLE pam.credential_jobs ADD COLUMN IF NOT EXISTS handler TEXT NOT NULL DEFAULT 'in_process'`,
    `ALTER TABLE pam.credential_jobs ADD COLUMN IF NOT EXISTS connector_key TEXT`,
    `ALTER TABLE pam.credential_jobs ADD COLUMN IF NOT EXISTS assigned_runner_id TEXT`,
    // Sealed (envelope-encrypted JSON) new credential the control plane generated
    // and handed to the runner; opened & activated only on a confirmed change.
    `ALTER TABLE pam.credential_jobs ADD COLUMN IF NOT EXISTS pending_secret TEXT`,
    `ALTER TABLE pam.credential_jobs ADD COLUMN IF NOT EXISTS report_seq INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jobs_handler ON pam.credential_jobs(handler, status, run_after)`,

    // ── connector registry hardening columns ──────────────────────────────────
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS sha256 TEXT`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS manifest TEXT`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS signing_key_id TEXT`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS activation_status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS compatibility TEXT`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS security_review TEXT NOT NULL DEFAULT 'approved'`,
    `ALTER TABLE pam.connectors ADD COLUMN IF NOT EXISTS uploaded_by TEXT`
  ]
}
