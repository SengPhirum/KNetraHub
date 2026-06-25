import { Pool, types } from 'pg'

// Postgres returns BIGINT (oid 20, e.g. byte counters and COUNT(*)) as JS
// strings by default to avoid silent precision loss above
// Number.MAX_SAFE_INTEGER. Nothing in this app approaches that range, so
// coerce to Number globally rather than at every call site.
types.setTypeParser(20, (val: string) => Number(val))

let _pool: Pool | null = null
let _migrated: Promise<void> | null = null

export function getDb(): Pool {
  if (!_pool) {
    const cfg = useRuntimeConfig().db
    _pool = new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      max: cfg.poolMax
    })
    _pool.on('error', (err) => {
      console.error('[db] idle pool client error', err)
    })
  }
  return _pool
}

/** Waits for Postgres to accept connections, retrying with backoff. The
 * Postgres/Timescale container may not be ready when the app container
 * starts - there's no reliable depends_on health-gating in a swarm stack
 * deploy, and Timescale's own first-boot init can itself take 10-30s. */
export async function waitForDb(maxAttempts = 30, delayMs = 2000): Promise<void> {
  const db = getDb()
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.query('SELECT 1')
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.warn(`[db] not ready yet (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/** Runs all app-data DDL migrations. Idempotent (IF NOT EXISTS everywhere)
 * and memoized so repeated calls (from multiple Nitro plugins, and
 * defensively from store.ts's ensureAdmin()) are cheap and don't depend on
 * plugin execution order. On failure the memo is cleared rather than caching
 * the rejection - otherwise one early caller racing a still-booting Postgres
 * would permanently wedge migrations, even after Postgres recovers. */
export async function migrate(): Promise<void> {
  if (!_migrated) {
    _migrated = runMigrations().catch((err) => {
      _migrated = null
      throw err
    })
  }
  return _migrated
}

async function runMigrations(): Promise<void> {
  const db = getDb()

  // App-data tables keep TEXT ISO8601 timestamps (identical to the old
  // SQLite schema) since they're only ever stored/displayed/sorted as
  // strings, never range-queried - only the metrics hypertables (see
  // metrics.ts) need real TIMESTAMPTZ columns for Timescale partitioning.
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      source TEXT NOT NULL DEFAULT 'local',
      password_hash TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    -- replaces SQLite's COLLATE NOCASE: case-insensitive uniqueness + lookup
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system',
      refresh_interval INTEGER NOT NULL DEFAULT 0,
      density TEXT NOT NULL DEFAULT 'default',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS registries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      username TEXT NOT NULL,
      auth TEXT
    );

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit (ts DESC);

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash);

    -- Browser login sessions, so a stateless JWT can be revoked ("sign out
    -- everywhere" / per-device) by deleting its row. The JWT carries this id as
    -- its sid claim; readSession rejects a token whose session row is gone.
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

    CREATE TABLE IF NOT EXISTS alert_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL,
      target TEXT,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      fired_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alert_events_fired_at ON alert_events (fired_at DESC);

    -- Network Module (LibreNMS MVP)
    CREATE TABLE IF NOT EXISTS net_devices (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      ip TEXT NOT NULL,
      type TEXT,
      vendor TEXT,
      os TEXT,
      status TEXT,
      uptime TEXT,
      snmp_version TEXT,
      snmp_community TEXT,
      poll_method TEXT DEFAULT 'ping',
      category TEXT DEFAULT 'network',
      sys_name TEXT,
      sys_descr TEXT,
      sys_object_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS net_interfaces (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT,
      speed TEXT,
      in_traffic TEXT,
      out_traffic TEXT,
      mac_address TEXT,
      mtu TEXT,
      admin_status TEXT,
      oper_status TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS net_sensors (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      sensor_type TEXT NOT NULL,
      name TEXT NOT NULL,
      current_value REAL,
      unit TEXT,
      limit_high REAL,
      limit_low REAL
    );

    CREATE TABLE IF NOT EXISTS net_alert_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      condition TEXT NOT NULL,
      threshold TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      enabled BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS net_alerts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      rule_id TEXT REFERENCES net_alert_rules(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS net_syslog (
      id TEXT PRIMARY KEY,
      device_id TEXT REFERENCES net_devices(id) ON DELETE CASCADE,
      facility TEXT,
      severity TEXT,
      program TEXT,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS net_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS net_device_groups (
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES net_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (device_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS net_backups (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      config_text TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS net_flows (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES net_devices(id) ON DELETE CASCADE,
      protocol TEXT NOT NULL,
      src_ip TEXT NOT NULL,
      dst_ip TEXT NOT NULL,
      src_port INTEGER,
      dst_port INTEGER,
      bytes INTEGER NOT NULL,
      packets INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );

    -- Server Module (Zabbix MVP)
    CREATE TABLE IF NOT EXISTS server_hosts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT,
      os TEXT,
      status TEXT,
      cpu TEXT,
      memory TEXT,
      uptime TEXT,
      agent TEXT
    );

    CREATE TABLE IF NOT EXISTS server_problems (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      severity TEXT,
      fired_at TEXT NOT NULL,
      duration TEXT,
      ack BOOLEAN DEFAULT false
    );

    -- IPAM Module (phpIPAM MVP)
    CREATE TABLE IF NOT EXISTS ipmgt_subnets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      network TEXT NOT NULL,
      vlan INTEGER,
      gateway TEXT,
      usage INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ipmgt_ips (
      id TEXT PRIMARY KEY,
      subnet_id TEXT NOT NULL REFERENCES ipmgt_subnets(id) ON DELETE CASCADE,
      ip TEXT NOT NULL,
      hostname TEXT,
      mac TEXT,
      description TEXT,
      state TEXT NOT NULL DEFAULT 'Available'
    );
  `)
}
