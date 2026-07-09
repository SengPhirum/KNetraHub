import { Pool, types } from 'pg'

// Postgres returns BIGINT (oid 20, e.g. byte counters and COUNT(*)) as JS
// strings by default to avoid silent precision loss above
// Number.MAX_SAFE_INTEGER. Nothing in this app approaches that range, so
// coerce to Number globally rather than at every call site.
types.setTypeParser(20, (val: string) => Number(val))

let _pool: Pool | null = null
let _migrated: Promise<void> | null = null
let _dbReady: Promise<void> | null = null

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
 * deploy, and Timescale's own first-boot init can itself take 10-30s.
 *
 * Memoized like migrate() below: several Nitro plugins (db.ts,
 * seedSubsystems.ts) each call this independently at boot, and without
 * memoization every one of them ran its own concurrent 30-attempt retry
 * loop - same outcome, but duplicated connection attempts and interleaved
 * "not ready yet (attempt N/30)" log lines. On failure the memo is cleared
 * (not cached as a rejection) so a later, separate wait can still succeed
 * once Postgres actually comes up. */
export async function waitForDb(maxAttempts = 30, delayMs = 2000): Promise<void> {
  if (!_dbReady) {
    _dbReady = attemptWaitForDb(maxAttempts, delayMs).catch((err) => {
      _dbReady = null
      throw err
    })
  }
  return _dbReady
}

async function attemptWaitForDb(maxAttempts: number, delayMs: number): Promise<void> {
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
    CREATE INDEX IF NOT EXISTS idx_net_alerts_timestamp ON net_alerts (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_net_alerts_device ON net_alerts (device_id);
    CREATE INDEX IF NOT EXISTS idx_net_alerts_status ON net_alerts (status);

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

    -- ── Server Module: full Zabbix clone (real ICMP+SNMP monitoring) ──────────
    -- Host = monitored machine (Zabbix host). Extend the MVP table with polling
    -- config (ICMP/SNMP incl. v3 creds mirroring net_devices), availability, and
    -- SNMP system info. The cpu/memory string columns are retired (items now hold
    -- real metric values) but left in place for backward compatibility.
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS poll_method TEXT NOT NULL DEFAULT 'icmp';
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_version TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_community TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_sec_level TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_auth_user TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_auth_protocol TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_auth_password TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_priv_protocol TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS snmp_priv_password TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS last_polled TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS last_rtt_ms DOUBLE PRECISION;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS sys_name TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS sys_descr TEXT;
    ALTER TABLE server_hosts ADD COLUMN IF NOT EXISTS created_at TEXT;

    -- Problems become event-like: a numeric Zabbix severity (0-5), open/resolved
    -- lifecycle, acknowledgement, an operator comment, and maintenance suppression.
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS trigger_id TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS severity_num INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'problem';
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS r_clock TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS ack_by TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS ack_at TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS comment TEXT;
    ALTER TABLE server_problems ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT false;

    -- Host groups (logical org, like Zabbix host groups) + membership.
    CREATE TABLE IF NOT EXISTS server_host_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_host_group_members (
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES server_host_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (host_id, group_id)
    );

    -- Host interfaces (Zabbix: agent/snmp/ipmi/jmx endpoints on a host).
    CREATE TABLE IF NOT EXISTS server_host_interfaces (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'agent',
      ip TEXT,
      dns TEXT,
      port INTEGER,
      main BOOLEAN NOT NULL DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_server_host_interfaces_host ON server_host_interfaces (host_id);

    -- Templates: reusable item + trigger bundles linked to hosts.
    CREATE TABLE IF NOT EXISTS server_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES server_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_ TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'snmp',
      value_type TEXT NOT NULL DEFAULT 'numeric',
      units TEXT,
      snmp_oid TEXT,
      update_interval INTEGER NOT NULL DEFAULT 60
    );
    CREATE TABLE IF NOT EXISTS server_template_triggers (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES server_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      item_key TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '>',
      threshold DOUBLE PRECISION,
      for_seconds INTEGER NOT NULL DEFAULT 0,
      severity INTEGER NOT NULL DEFAULT 2
    );
    CREATE TABLE IF NOT EXISTS server_host_templates (
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES server_templates(id) ON DELETE CASCADE,
      PRIMARY KEY (host_id, template_id)
    );

    -- Items: the metric-collection units (Zabbix item). last_value/last_clock hold
    -- the newest sample; full history lives in the server_item_history hypertable.
    CREATE TABLE IF NOT EXISTS server_items (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      template_id TEXT,
      name TEXT NOT NULL,
      key_ TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'snmp',
      value_type TEXT NOT NULL DEFAULT 'numeric',
      units TEXT,
      snmp_oid TEXT,
      update_interval INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'enabled',
      last_value DOUBLE PRECISION,
      last_text TEXT,
      last_clock TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_server_items_host ON server_items (host_id);
    -- Counter-type items (e.g. interface traffic) need the previous raw reading
    -- + its timestamp to derive a bits/sec rate; last_value/last_clock instead
    -- hold the derived rate that gets charted.
    ALTER TABLE server_items ADD COLUMN IF NOT EXISTS raw_counter DOUBLE PRECISION;
    ALTER TABLE server_items ADD COLUMN IF NOT EXISTS raw_counter_at TEXT;

    -- Triggers: a threshold condition on an item that opens a problem (Zabbix
    -- trigger). last_state tracks ok/problem; since = when the breach began (for
    -- the sustained "for" window).
    CREATE TABLE IF NOT EXISTS server_triggers (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES server_hosts(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES server_items(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '>',
      threshold DOUBLE PRECISION,
      for_seconds INTEGER NOT NULL DEFAULT 0,
      severity INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'enabled',
      last_state TEXT NOT NULL DEFAULT 'ok',
      since TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_server_triggers_host ON server_triggers (host_id);

    -- Maintenance windows: during an active window, matching hosts' new problems
    -- are suppressed. host_ids/group_ids are JSON arrays.
    CREATE TABLE IF NOT EXISTS server_maintenance (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active_since TEXT NOT NULL,
      active_till TEXT NOT NULL,
      host_ids TEXT NOT NULL DEFAULT '[]',
      group_ids TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      created_at TEXT NOT NULL
    );

    -- Actions: notify via an alert channel when a problem >= min_severity opens.
    CREATE TABLE IF NOT EXISTS server_actions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      min_severity INTEGER NOT NULL DEFAULT 2,
      channel_id TEXT,
      status TEXT NOT NULL DEFAULT 'enabled',
      created_at TEXT NOT NULL
    );

    -- Services: a tree for SLA rollup (leaf services map to a trigger).
    CREATE TABLE IF NOT EXISTS server_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      algorithm TEXT NOT NULL DEFAULT 'worst',
      sla_target DOUBLE PRECISION DEFAULT 99.9,
      trigger_id TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Network maps: a JSON canvas of host nodes + links (like the net maps).
    CREATE TABLE IF NOT EXISTS server_maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{"nodes":[],"links":[]}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Discovery: scan a CIDR (ICMP/SNMP) to auto-create hosts.
    CREATE TABLE IF NOT EXISTS server_discovery_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cidr TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'icmp',
      snmp_community TEXT,
      status TEXT NOT NULL DEFAULT 'enabled',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_discovery_jobs (
      id TEXT PRIMARY KEY,
      rule_id TEXT,
      cidr TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'icmp',
      status TEXT NOT NULL DEFAULT 'completed',
      scanned INTEGER DEFAULT 0,
      found INTEGER DEFAULT 0,
      added INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    -- Web monitoring: an HTTP scenario polled for status + latency.
    CREATE TABLE IF NOT EXISTS server_web_scenarios (
      id TEXT PRIMARY KEY,
      host_id TEXT REFERENCES server_hosts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      expected_status INTEGER NOT NULL DEFAULT 200,
      interval INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'enabled',
      last_status TEXT,
      last_code INTEGER,
      last_ms DOUBLE PRECISION,
      last_check TEXT,
      created_at TEXT NOT NULL
    );

    -- Web scenario steps (Zabbix: an ordered list of HTTP requests; the scenario
    -- is "up" only if every step passes its expected status + optional string).
    CREATE TABLE IF NOT EXISTS server_web_steps (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES server_web_scenarios(id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      expected_status INTEGER NOT NULL DEFAULT 200,
      required_string TEXT,
      last_status TEXT,
      last_code INTEGER,
      last_ms DOUBLE PRECISION,
      last_check TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_server_web_steps_scenario ON server_web_steps (scenario_id, step_no);

    -- SNMP trap log: incoming traps received by server/plugins/trapReceiver.ts
    -- (NUXT_SERVER_TRAP_ENABLED=true), matched to a known host by source IP when
    -- possible. Well-known traps (linkDown/linkUp/coldStart/authenticationFailure)
    -- also open/resolve a server_problems row; every trap is logged here either way.
    CREATE TABLE IF NOT EXISTS server_traps (
      id TEXT PRIMARY KEY,
      host_id TEXT REFERENCES server_hosts(id) ON DELETE SET NULL,
      source_ip TEXT NOT NULL,
      version TEXT NOT NULL,
      trap_oid TEXT,
      name TEXT NOT NULL,
      severity_num INTEGER NOT NULL DEFAULT 3,
      varbinds TEXT,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_server_traps_host ON server_traps (host_id);
    CREATE INDEX IF NOT EXISTS idx_server_traps_received ON server_traps (received_at DESC);

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

    -- ── IPAM Module: full phpIPAM-style schema (Phase 1) ─────────────────────
    -- Sections (phpIPAM sections/tenants): a tree grouping subnets by
    -- department/environment/branch/zone. strict_mode enforces that child
    -- subnets nest within a parent subnet's range.
    CREATE TABLE IF NOT EXISTS ipmgt_sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT REFERENCES ipmgt_sections(id) ON DELETE SET NULL,
      strict_mode BOOLEAN NOT NULL DEFAULT false,
      display_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_sections_parent ON ipmgt_sections(parent_id);

    -- L2 domains (phpIPAM VLAN domains): a namespace within which a VLAN id is
    -- unique. The same VLAN id may repeat across different L2 domains.
    CREATE TABLE IF NOT EXISTS ipmgt_l2domains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ipmgt_vlans (
      id TEXT PRIMARY KEY,
      vlan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      l2domain_id TEXT REFERENCES ipmgt_l2domains(id) ON DELETE SET NULL,
      location TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vlans_vid ON ipmgt_vlans(vlan_id);

    -- VRFs: allow overlapping IP space when subnets belong to different VRFs.
    CREATE TABLE IF NOT EXISTS ipmgt_vrfs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rd TEXT,
      description TEXT,
      owner TEXT,
      location TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    -- Extend the MVP subnet table into a full IPAM subnet. network still holds
    -- the CIDR string (e.g. "10.0.1.0/24"); version/prefix/netmask are derived
    -- and cached for display + fast filtering. vlan_ref/vrf_id/section_id link
    -- to the tables above; parent_id nests subnets into a tree.
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS section_id TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS parent_id TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS vlan_ref TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS vrf_id TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 4;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS prefix INTEGER;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS netmask TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS dns_servers TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS owner TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS allow_requests BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS scan_enabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS ping_enabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS dns_resolve BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS dhcp_range BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS created_at TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS updated_at TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS created_by TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS updated_by TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_subnets_section ON ipmgt_subnets(section_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_subnets_parent ON ipmgt_subnets(parent_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_subnets_vrf ON ipmgt_subnets(vrf_id);

    -- Extend the MVP address table. status is the canonical lifecycle field
    -- (used | reserved | dhcp | offline | deprecated | gateway); the legacy
    -- "state" column is retained and mirrored for backward compatibility. Free
    -- addresses are intentionally NOT stored — free == in-subnet minus rows here.
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS status TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS owner TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS device TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS dns_name TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS ptr TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS nat_to TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS last_seen TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS last_scanned TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS created_at TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS updated_at TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS created_by TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS updated_by TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ips_subnet ON ipmgt_ips(subnet_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ips_ip ON ipmgt_ips(ip);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ips_status ON ipmgt_ips(status);

    -- Per-address change history (IP detail "History" tab).
    CREATE TABLE IF NOT EXISTS ipmgt_ip_history (
      id TEXT PRIMARY KEY,
      ip_id TEXT,
      subnet_id TEXT,
      ip TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT,
      detail TEXT,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ip_history_ipid ON ipmgt_ip_history(ip_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ip_history_changed ON ipmgt_ip_history(changed_at DESC);

    -- SSO realm/group roles as of the user's last login, snapshotted for the
    -- User Authority report (audit review of who has access to what without
    -- requiring every user to be currently logged in).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS realm_roles TEXT;
  `)
}
