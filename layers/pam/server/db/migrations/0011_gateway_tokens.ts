import type { Migration } from './types'

/**
 * One-time gateway-token registry for replay protection. Every issued gateway
 * token carries a `jti`; the credential checkout consumes it atomically, so a
 * captured token can never be exchanged for a target credential twice.
 * Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0011_gateway_tokens',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.gateway_tokens (
      jti TEXT PRIMARY KEY,
      session_id TEXT,
      user_name TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      consumed_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_gateway_tokens_session ON pam.gateway_tokens(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_gateway_tokens_expires ON pam.gateway_tokens(expires_at)`
  ]
}
