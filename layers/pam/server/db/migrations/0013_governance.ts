import type { Migration } from './types'

/**
 * Governance hardening: record the approver type on each approval slot (for
 * eligibility + audit), version access policies, and track step-up challenges
 * for freshness/replay protection. Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0013_governance',
  statements: [
    `ALTER TABLE pam.request_approvals ADD COLUMN IF NOT EXISTS approver_type TEXT`,
    `ALTER TABLE pam.access_policies ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`,

    `CREATE TABLE IF NOT EXISTS pam.access_policy_versions (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES pam.access_policies(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      definition TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_policy_versions ON pam.access_policy_versions(policy_id, version)`,

    // Step-up challenges: a short-lived nonce proving a fresh human re-auth for
    // a high-risk action, so a bearer token alone can never satisfy step-up.
    `CREATE TABLE IF NOT EXISTS pam.stepup_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'security_password',
      purpose TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_stepup_user ON pam.stepup_challenges(user_id, expires_at)`
  ]
}
