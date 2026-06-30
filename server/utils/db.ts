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

    -- Network Module: PRTG-style extensions ---------------------------------
    -- Probes are the data collectors (local + remote/distributed sites) that a
    -- device reports through; powers the Probes page and the distributed map.
    CREATE TABLE IF NOT EXISTS net_probes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'remote',        -- local | remote | multi-platform
      location TEXT,
      ip TEXT,
      version TEXT,
      status TEXT NOT NULL DEFAULT 'connected',   -- connected | disconnected
      latitude REAL,
      longitude REAL,
      last_seen TEXT,
      created_at TEXT NOT NULL
    );

    -- Which probe collects a device's data (null = unassigned/local).
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS probe_id TEXT REFERENCES net_probes(id) ON DELETE SET NULL;

    -- Real-poller bookkeeping: last successful poll + last measured ICMP latency.
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS last_polled TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS last_rtt_ms REAL;

    -- SNMPv3 credentials (used when snmp_version = 'v3'; snmp_community is the
    -- v1/v2c equivalent). Stored as the net-snmp protocol keys so the poller can
    -- map them directly (sec level: noAuthNoPriv|authNoPriv|authPriv;
    -- auth: md5|sha|sha256|sha512; priv: des|aes|aes256b).
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_sec_level TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_auth_user TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_auth_protocol TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_auth_password TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_priv_protocol TEXT;
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS snmp_priv_password TEXT;

    -- Interface counter snapshots so the poller can derive bit-rate between polls.
    ALTER TABLE net_interfaces ADD COLUMN IF NOT EXISTS if_index INTEGER;
    ALTER TABLE net_interfaces ADD COLUMN IF NOT EXISTS last_in_octets BIGINT;
    ALTER TABLE net_interfaces ADD COLUMN IF NOT EXISTS last_out_octets BIGINT;
    ALTER TABLE net_interfaces ADD COLUMN IF NOT EXISTS last_poll_at TEXT;

    -- Auto-discovery scan jobs (scan an IP range, create devices/sensors).
    CREATE TABLE IF NOT EXISTS net_discovery_jobs (
      id TEXT PRIMARY KEY,
      cidr TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'ping+snmp',
      status TEXT NOT NULL DEFAULT 'completed',   -- running | completed | failed
      scanned INTEGER DEFAULT 0,
      found INTEGER DEFAULT 0,
      added INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    -- Generated reports (availability / traffic / sensor-health / inventory).
    -- summary holds a JSON snapshot rendered by the Reports page.
    CREATE TABLE IF NOT EXISTS net_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      period TEXT NOT NULL,
      format TEXT DEFAULT 'html',
      summary TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    -- Per-user customizable PRTG-style overview dashboards. layout is a JSON
    -- array of widgets ({ i, x, y, w, h, type, config }) driving the drag/resize
    -- grid on /net; owner is users.id (one user has many dashboards).
    CREATE TABLE IF NOT EXISTS net_dashboards (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      layout TEXT NOT NULL DEFAULT '[]',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_net_dashboards_owner ON net_dashboards (owner);

    -- Device onboarding templates: a saved bundle of defaults (category, poll
    -- method, SNMP settings) so a new device can be created with one pick rather
    -- than re-entering credentials each time (PRTG "device template" concept).
    CREATE TABLE IF NOT EXISTS net_device_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'network',
      poll_method TEXT NOT NULL DEFAULT 'snmp',
      snmp_version TEXT,
      snmp_community TEXT,
      snmp_sec_level TEXT,
      snmp_auth_user TEXT,
      snmp_auth_protocol TEXT,
      snmp_auth_password TEXT,
      snmp_priv_protocol TEXT,
      snmp_priv_password TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    -- Groups gained a created_at so the Groups page can show/sort by age.
    ALTER TABLE net_groups ADD COLUMN IF NOT EXISTS created_at TEXT;

    -- Pause/resume monitoring (PRTG core): a paused device is skipped by the
    -- poller and shown as "paused" rather than flapping to "down".
    ALTER TABLE net_devices ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT true;

    -- Alert acknowledgement (PRTG): an operator can ack an active alarm so it's
    -- visibly owned without clearing it; the poller still recovers it on its own.
    ALTER TABLE net_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TEXT;
    ALTER TABLE net_alerts ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

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
