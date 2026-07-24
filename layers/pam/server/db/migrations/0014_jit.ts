import type { Migration } from './types'

/**
 * JIT entitlement state machine + provider. `state` drives the full lifecycle
 * (requested→approved→provisioning→active→revoking→revoked + failure states);
 * `provider` selects the JIT provider; `evidence` records provision/revocation
 * proof. Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0014_jit',
  statements: [
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'requested'`,
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS provider TEXT`,
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS renewed_at TEXT`,
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS evidence TEXT`,
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS scope TEXT`,
    `ALTER TABLE pam.jit_entitlements ADD COLUMN IF NOT EXISTS requested_by TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_pam_jit_state ON pam.jit_entitlements(state, expires_at)`
  ]
}
