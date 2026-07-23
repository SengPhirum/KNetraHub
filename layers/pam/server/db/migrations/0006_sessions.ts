import type { Migration } from './types'

/**
 * Privileged sessions brokered through a gateway. Session metadata, the event
 * timeline, command log, encrypted recording metadata (binaries live in object
 * storage, NOT here), investigation markers, and the gateway registry/health.
 */
export const migration: Migration = {
  id: '0006_sessions',
  statements: [
    `CREATE TABLE IF NOT EXISTS pam.gateways (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('ssh','rdp','vnc','db','web','cloud')),
      address TEXT,
      protocols TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      drain_mode BOOLEAN NOT NULL DEFAULT false,
      capacity INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pam.gateway_health (
      id TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL REFERENCES pam.gateways(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','offline','unknown')),
      active_sessions INTEGER NOT NULL DEFAULT 0,
      detail TEXT,
      reported_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_gateway_health_gw ON pam.gateway_health(gateway_id, reported_at DESC)`,

    `CREATE TABLE IF NOT EXISTS pam.sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT REFERENCES pam.accounts(id) ON DELETE SET NULL,
      grant_id TEXT REFERENCES pam.access_grants(id) ON DELETE SET NULL,
      request_id TEXT,
      gateway_id TEXT REFERENCES pam.gateways(id) ON DELETE SET NULL,
      principal TEXT NOT NULL,
      user_id TEXT,
      target TEXT,
      protocol TEXT NOT NULL DEFAULT 'ssh',
      source_ip TEXT,
      user_agent TEXT,
      approval_policy_id TEXT,
      reason TEXT,
      ticket TEXT,
      recording_required BOOLEAN NOT NULL DEFAULT true,
      recording_status TEXT NOT NULL DEFAULT 'pending' CHECK (recording_status IN ('pending','recording','stored','failed','disabled')),
      risk_score INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'starting' CHECK (state IN ('starting','active','idle','ended','terminated','error')),
      idle BOOLEAN NOT NULL DEFAULT false,
      emergency BOOLEAN NOT NULL DEFAULT false,
      started_at TEXT NOT NULL,
      last_activity_at TEXT,
      ended_at TEXT,
      termination_reason TEXT,
      command_count INTEGER NOT NULL DEFAULT 0,
      blocked_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_sessions_state ON pam.sessions(state)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_sessions_user ON pam.sessions(principal)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_sessions_account ON pam.sessions(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_sessions_started ON pam.sessions(started_at DESC)`,

    `CREATE TABLE IF NOT EXISTS pam.session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES pam.sessions(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_session_events_sess ON pam.session_events(session_id, ts)`,

    `CREATE TABLE IF NOT EXISTS pam.session_commands (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES pam.sessions(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      seq INTEGER NOT NULL,
      command TEXT NOT NULL,
      risk TEXT,
      blocked BOOLEAN NOT NULL DEFAULT false,
      offset_ms INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_session_cmds_sess ON pam.session_commands(session_id, seq)`,
    `CREATE INDEX IF NOT EXISTS idx_pam_session_cmds_search ON pam.session_commands(session_id, lower(command))`,

    // Recording binaries are stored in object storage / MinIO / NFS. Here we
    // keep only metadata + integrity material (checksum + keyed signature).
    `CREATE TABLE IF NOT EXISTS pam.session_recordings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES pam.sessions(id) ON DELETE CASCADE,
      format TEXT NOT NULL DEFAULT 'asciicast',
      storage_backend TEXT NOT NULL DEFAULT 'object',
      storage_key TEXT,
      size_bytes BIGINT,
      duration_ms INTEGER,
      encrypted BOOLEAN NOT NULL DEFAULT true,
      key_version INTEGER,
      checksum TEXT,
      signature TEXT,
      signing_key_version INTEGER,
      integrity_ok BOOLEAN,
      integrity_checked_at TEXT,
      legal_hold BOOLEAN NOT NULL DEFAULT false,
      retention_until TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_recordings_sess ON pam.session_recordings(session_id)`,

    `CREATE TABLE IF NOT EXISTS pam.session_markers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES pam.sessions(id) ON DELETE CASCADE,
      offset_ms INTEGER,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      created_by TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pam_session_markers_sess ON pam.session_markers(session_id)`
  ]
}
