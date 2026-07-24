import type { Migration } from './types'

/**
 * Discovery extensions. `privilege_level` was referenced by the discover job and
 * the onboard handler but never existed in 0004 (the first discover would have
 * crashed on insert) — add it, plus source_type/tags/risk_level/evidence used by
 * the scan engine and pending-queue filters. Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0012_discovery_ext',
  statements: [
    `ALTER TABLE pam.discovered_accounts ADD COLUMN IF NOT EXISTS privilege_level TEXT`,
    `ALTER TABLE pam.discovered_accounts ADD COLUMN IF NOT EXISTS source_type TEXT`,
    `ALTER TABLE pam.discovered_accounts ADD COLUMN IF NOT EXISTS tags TEXT`,
    `ALTER TABLE pam.discovered_accounts ADD COLUMN IF NOT EXISTS risk_level TEXT`,
    `ALTER TABLE pam.discovered_accounts ADD COLUMN IF NOT EXISTS existing_account_id TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_pam_disc_accounts_source ON pam.discovered_accounts(source_id, status)`
  ]
}
