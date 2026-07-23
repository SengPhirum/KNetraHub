import type { Migration } from './types'

/**
 * PAM core infrastructure: the dedicated `pam` schema, key registry, the
 * tamper-evident append-only audit chain + signed checkpoints, settings, tags,
 * and the in-schema notification log. App-data timestamps are TEXT ISO8601
 * (UTC, lexicographically sortable) matching the KNetraHub house convention;
 * only monotonic ordering (audit seq) uses a real sequence.
 */
export const migration: Migration = {
  id: '0001_core',
  statements: [
    `CREATE SCHEMA IF NOT EXISTS pam`,

    // Master-key (KEK) version registry. The actual key material NEVER lives
    // in the database — it is loaded from a Docker secret / _FILE env var (see
    // pamCrypto.ts). This table only tracks each version's lifecycle and a
    // NON-reversible fingerprint used to detect a wrong/rotated key at boot.
    `CREATE TABLE IF NOT EXISTS pam.crypto_keys (
      id TEXT PRIMARY KEY,
      version INTEGER UNIQUE NOT NULL,
      algo TEXT NOT NULL DEFAULT 'aes-256-gcm',
      purpose TEXT NOT NULL DEFAULT 'master',
      state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('pending','active','retired','compromised')),
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      retired_at TEXT,
      created_by TEXT,
      note TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_crypto_keys_state ON pam.crypto_keys(state)`,

    // Append-only audit trail with hash chaining. Each row's hash covers its
    // own canonical fields plus the previous row's hash; a signed checkpoint
    // periodically anchors the chain. seq is a gap-tolerant monotonic order.
    `CREATE TABLE IF NOT EXISTS pam.audit_events (
      id TEXT PRIMARY KEY,
      seq BIGSERIAL UNIQUE,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_source TEXT,
      effective_permissions TEXT,
      source_ip TEXT,
      user_agent TEXT,
      action TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      safe_id TEXT,
      request_id TEXT,
      session_id TEXT,
      result TEXT NOT NULL DEFAULT 'success',
      reason TEXT,
      ticket TEXT,
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','notice','warning','high','critical')),
      details TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      signing_key_version INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_ts ON pam.audit_events(ts DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_actor ON pam.audit_events(actor)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_object ON pam.audit_events(object_type, object_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_action ON pam.audit_events(action)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_severity ON pam.audit_events(severity)`,

    `CREATE TABLE IF NOT EXISTS pam.audit_checkpoints (
      id TEXT PRIMARY KEY,
      seq_from BIGINT NOT NULL,
      seq_to BIGINT NOT NULL,
      event_count INTEGER NOT NULL,
      ts TEXT NOT NULL,
      chain_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      signing_key_version INTEGER,
      created_by TEXT,
      verified_ok BOOLEAN,
      verified_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_audit_ckpt_ts ON pam.audit_checkpoints(ts DESC)`,

    // Key/value settings for the whole PAM subsystem (retention windows, risk
    // policy toggles, default reveal seconds, ZSP mode, etc.). Values are JSON.
    `CREATE TABLE IF NOT EXISTS pam.settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pam_tags_name ON pam.tags(lower(name))`,

    `CREATE TABLE IF NOT EXISTS pam.object_tags (
      tag_id TEXT NOT NULL REFERENCES pam.tags(id) ON DELETE CASCADE,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      PRIMARY KEY (tag_id, object_type, object_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_object_tags_obj ON pam.object_tags(object_type, object_id)`,

    // In-schema notification log (PAM also emits to the central portal feed).
    `CREATE TABLE IF NOT EXISTS pam.notifications (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL,
      event TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      link TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_notifications_created ON pam.notifications(created_at DESC)`
  ]
}
