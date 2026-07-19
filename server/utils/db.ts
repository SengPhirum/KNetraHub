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
 * Memoized like migrate() below because multiple Nitro plugins may call this
 * independently at boot. Without memoization each would run a concurrent
 * retry loop, duplicating connection attempts and interleaving readiness log
 * lines. On failure the memo is cleared
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

export type BaseSchemaScope = 'portal' | 'docker' | 'ipmgt'

function schemaScope(statement: string): BaseSchemaScope {
  const sql = statement.toLowerCase()
  if (/\bipmgt_[a-z0-9_]+\b/.test(sql)) return 'ipmgt'
  if (/\b(docker_settings|registries|stack_history|alert_channels|alert_events)\b/.test(sql)) return 'docker'
  return 'portal'
}

/**
 * Initialize only the tables owned by one database boundary. The DDL remains
 * in one audited definition, but every statement is routed to exactly one
 * target: portal, Docker, or IP Management. Monitoring retains its ordered
 * migration set under layers/monitoring/server/db.
 */
export async function migrateModuleBase(scope: Exclude<BaseSchemaScope, 'portal'>, db: Pool): Promise<void> {
  await runMigrations(scope, db)
}

async function runMigrations(scope: BaseSchemaScope = 'portal', db: Pool = getDb()): Promise<void> {

  // App-data tables keep TEXT ISO8601 timestamps (identical to the old
  // SQLite schema) since they're only ever stored/displayed/sorted as
  // strings, never range-queried - only the metrics hypertables (see
  // metrics.ts) need real TIMESTAMPTZ columns for Timescale partitioning.
  const schemaSql = `
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

    -- When true, an admin has manually set this user's role (Users page), so
    -- OIDC/LDAP group-mapped logins must NOT overwrite it on every sign-in -
    -- only an explicit "reset role" action clears the lock and lets the
    -- group mapping apply again on the next login.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role_locked BOOLEAN NOT NULL DEFAULT false;

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

    CREATE TABLE IF NOT EXISTS docker_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
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
    -- Backs the "recent login" lookup polled every 10s per logged-in tab
    -- (server/api/user/notifications.get.ts: actor + action = 'auth.login' + ts range).
    CREATE INDEX IF NOT EXISTS idx_audit_actor_action_ts ON audit (actor, action, ts);

    -- Per-module user activity trail (who did what, from which module's UI).
    -- Written automatically for every authenticated state-changing API call
    -- (see server/plugins/moduleLogs.ts), so every action button a user clicks
    -- lands here with the acting user - separate from the portal-level "audit"
    -- table, which keeps its curated, long-retention entries.
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      module TEXT NOT NULL,
      actor TEXT NOT NULL,
      role TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      status INTEGER,
      ip TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_module_ts ON activity_log (module, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON activity_log (ts DESC);

    -- System/runtime events, stored separately from user activity by design
    -- (login failures, auto-redeploys, housekeeping runs, module errors).
    CREATE TABLE IF NOT EXISTS system_log (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      module TEXT NOT NULL,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_system_log_module_ts ON system_log (module, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_system_log_ts ON system_log (ts DESC);

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

    -- Runtime lifecycle and encrypted connection configuration for built-in
    -- subsystem databases. Absence of a row means never initialized/disabled.
    CREATE TABLE IF NOT EXISTS module_databases (
      module_key TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'disabled',
      host_mode TEXT NOT NULL DEFAULT 'portal-host',
      db_host TEXT,
      db_port INTEGER,
      db_name TEXT NOT NULL,
      db_user TEXT,
      db_password_enc TEXT,
      db_ssl BOOLEAN NOT NULL DEFAULT false,
      admin_database TEXT,
      pool_max INTEGER NOT NULL DEFAULT 20,
      initialized_at TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_module_databases_enabled ON module_databases(enabled, status);

    -- Stack deploy history: every deploy/update/rollback records the compose
    -- content here (the local, always-on equivalent of the GitLab commit
    -- trail). gitlab_sha links a version to its GitLab commit once synced -
    -- rows without one exist only locally. created_at keeps ISO8601 TEXT like
    -- every other app-data table.
    CREATE TABLE IF NOT EXISTS stack_history (
      id TEXT PRIMARY KEY,
      stack_name TEXT NOT NULL,
      compose TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT,
      source TEXT NOT NULL DEFAULT 'local',
      gitlab_sha TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stack_history_stack ON stack_history (stack_name, created_at DESC);
    -- One local row per GitLab commit, so a re-sync can never duplicate pulls.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_history_sha ON stack_history (stack_name, gitlab_sha) WHERE gitlab_sha IS NOT NULL;

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL,
      target TEXT,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      fired_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alert_events_fired_at ON alert_events (fired_at DESC);

    -- IPAM Module (phpIPAM MVP)
    CREATE TABLE IF NOT EXISTS ipmgt_subnets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      network TEXT NOT NULL,
      vlan INTEGER,
      gateway TEXT,
      usage INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ipmgt_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
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

    -- IPAM Module (Phase 1): first-class Location/Customer/Device inventory.
    -- These replace the free-text location/owner/device columns above with
    -- real linkable records; the old TEXT columns are kept for backward
    -- compatibility and as a manual-entry fallback.
    CREATE TABLE IF NOT EXISTS ipmgt_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      parent_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      location_type TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_locations_parent ON ipmgt_locations(parent_id);

    CREATE TABLE IF NOT EXISTS ipmgt_customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );

    -- SNMP secrets are stored encrypted (secretCrypto.ts AES-256-GCM) in the
    -- *_enc columns - never plaintext. API responses expose only
    -- snmp_*_set booleans (see stripDeviceSnmpSecrets in ipamStore.ts).
    CREATE TABLE IF NOT EXISTS ipmgt_devices (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      display_name TEXT,
      description TEXT,
      device_type TEXT,
      vendor TEXT,
      model TEXT,
      serial_number TEXT,
      asset_number TEXT,
      management_ip TEXT,
      location_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      customer_id TEXT REFERENCES ipmgt_customers(id) ON DELETE SET NULL,
      snmp_version TEXT,
      snmp_community_enc TEXT,
      snmp_sec_level TEXT,
      snmp_auth_user TEXT,
      snmp_auth_protocol TEXT,
      snmp_auth_password_enc TEXT,
      snmp_priv_protocol TEXT,
      snmp_priv_password_enc TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_devices_location ON ipmgt_devices(location_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_devices_customer ON ipmgt_devices(customer_id);

    -- Additive soft-FK columns on the existing IPAM tables - no REFERENCES
    -- clause, matching the section_id/vrf_id/vlan_ref precedent above;
    -- application code owns referential cleanup on delete (see usedByRows
    -- checks in the locations/customers/devices delete handlers).
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS location_id TEXT;
    ALTER TABLE ipmgt_subnets ADD COLUMN IF NOT EXISTS customer_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_subnets_location ON ipmgt_subnets(location_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_subnets_customer ON ipmgt_subnets(customer_id);

    ALTER TABLE ipmgt_vlans ADD COLUMN IF NOT EXISTS location_id TEXT;
    ALTER TABLE ipmgt_vlans ADD COLUMN IF NOT EXISTS customer_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vlans_location ON ipmgt_vlans(location_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vlans_customer ON ipmgt_vlans(customer_id);

    ALTER TABLE ipmgt_vrfs ADD COLUMN IF NOT EXISTS location_id TEXT;
    ALTER TABLE ipmgt_vrfs ADD COLUMN IF NOT EXISTS customer_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vrfs_location ON ipmgt_vrfs(location_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vrfs_customer ON ipmgt_vrfs(customer_id);

    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS customer_id TEXT;
    ALTER TABLE ipmgt_ips ADD COLUMN IF NOT EXISTS device_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ips_customer ON ipmgt_ips(customer_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_ips_device ON ipmgt_ips(device_id);

    -- IPAM Module (Phase 2): admin-defined custom fields, generic across the
    -- major entity types. Values are stored as plain TEXT (canonical string
    -- form per field_type) - matches the house convention of app-level
    -- validation/coercion over DB-enforced typing, and this app's realistic
    -- scale doesn't need native JSONB/EAV-typed-column complexity.
    CREATE TABLE IF NOT EXISTS ipmgt_custom_field_defs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options TEXT,
      default_value TEXT,
      required BOOLEAN NOT NULL DEFAULT false,
      unique_value BOOLEAN NOT NULL DEFAULT false,
      searchable BOOLEAN NOT NULL DEFAULT false,
      visible_list BOOLEAN NOT NULL DEFAULT true,
      visible_detail BOOLEAN NOT NULL DEFAULT true,
      visible_export BOOLEAN NOT NULL DEFAULT true,
      display_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ipmgt_cf_defs_key ON ipmgt_custom_field_defs(entity_type, field_key);

    CREATE TABLE IF NOT EXISTS ipmgt_custom_field_values (
      id TEXT PRIMARY KEY,
      field_id TEXT NOT NULL REFERENCES ipmgt_custom_field_defs(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ipmgt_cf_values_unique ON ipmgt_custom_field_values(field_id, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_cf_values_entity ON ipmgt_custom_field_values(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_cf_values_value ON ipmgt_custom_field_values(field_id, value);

    -- IPAM Module (Phase 3): IP address request/approval workflow. A request
    -- targets a subnet (which must have allow_requests=true); the requested
    -- IP is optional (blank = auto-allocate first-free on approval).
    -- Approval and fulfillment happen atomically in one step (see
    -- requests/[id]/approve.post.ts) - phpIPAM's separate "approve" then
    -- "fulfill" steps are collapsed since nothing in this app defers actual
    -- provisioning to a later step.
    CREATE TABLE IF NOT EXISTS ipmgt_requests (
      id TEXT PRIMARY KEY,
      subnet_id TEXT NOT NULL,
      requested_ip TEXT,
      hostname TEXT,
      mac TEXT,
      owner TEXT,
      description TEXT,
      justification TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      requester TEXT NOT NULL,
      approver TEXT,
      admin_comment TEXT,
      ip_id TEXT,
      assigned_ip TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_requests_subnet ON ipmgt_requests(subnet_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_requests_status ON ipmgt_requests(status);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_requests_requester ON ipmgt_requests(requester);

    -- IPAM Module (Phase 5): host-status scanning + new-host discovery run
    -- history (layers/ipmgt/server/utils/ipamScan.ts, plugins/ipamScanner.ts).
    CREATE TABLE IF NOT EXISTS ipmgt_scan_history (
      id TEXT PRIMARY KEY,
      subnet_id TEXT,
      trigger TEXT NOT NULL DEFAULT 'scheduled',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      hosts_scanned INTEGER NOT NULL DEFAULT 0,
      hosts_up INTEGER NOT NULL DEFAULT 0,
      new_hosts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      actor TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_scan_history_subnet ON ipmgt_scan_history(subnet_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_scan_history_started ON ipmgt_scan_history(started_at DESC);

    -- IPAM Module (Phase 7): rack elevation - a rack has a fixed U height,
    -- items (devices or passive gear) occupy a contiguous U range on the
    -- front or rear face. Overlap/bounds are enforced in the API, not here.
    CREATE TABLE IF NOT EXISTS ipmgt_racks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      location_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      room TEXT,
      row_name TEXT,
      size_u INTEGER NOT NULL DEFAULT 42,
      starting_unit INTEGER NOT NULL DEFAULT 1,
      orientation TEXT NOT NULL DEFAULT 'top-down',
      active BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_racks_location ON ipmgt_racks(location_id);

    CREATE TABLE IF NOT EXISTS ipmgt_rack_items (
      id TEXT PRIMARY KEY,
      rack_id TEXT NOT NULL REFERENCES ipmgt_racks(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES ipmgt_devices(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'device',
      position_u INTEGER NOT NULL,
      height_u INTEGER NOT NULL DEFAULT 1,
      side TEXT NOT NULL DEFAULT 'front',
      color TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_rack_items_rack ON ipmgt_rack_items(rack_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_rack_items_device ON ipmgt_rack_items(device_id);

    -- IPAM Module (Phase 8): circuits (physical/logical/virtual WAN or
    -- inter-site links) and their providers/types, tracked for expiry and
    -- endpoint mapping.
    CREATE TABLE IF NOT EXISTS ipmgt_circuit_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ipmgt_circuits (
      id TEXT PRIMARY KEY,
      circuit_ref TEXT NOT NULL,
      provider_id TEXT REFERENCES ipmgt_circuit_providers(id) ON DELETE SET NULL,
      circuit_type TEXT NOT NULL DEFAULT 'physical',
      status TEXT NOT NULL DEFAULT 'active',
      bandwidth TEXT,
      description TEXT,
      customer_id TEXT REFERENCES ipmgt_customers(id) ON DELETE SET NULL,
      order_reference TEXT,
      install_date TEXT,
      expiry_date TEXT,
      endpoint_a_location_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      endpoint_a_device_id TEXT REFERENCES ipmgt_devices(id) ON DELETE SET NULL,
      endpoint_a_note TEXT,
      endpoint_b_location_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      endpoint_b_device_id TEXT REFERENCES ipmgt_devices(id) ON DELETE SET NULL,
      endpoint_b_note TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_circuits_provider ON ipmgt_circuits(provider_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_circuits_customer ON ipmgt_circuits(customer_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_circuits_expiry ON ipmgt_circuits(expiry_date);

    -- IPAM Module (Phase 9): NAT rule bindings between an internal object
    -- (address/subnet) and its translated external representation.
    CREATE TABLE IF NOT EXISTS ipmgt_nat_rules (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL DEFAULT 'static',
      source_ip_id TEXT REFERENCES ipmgt_ips(id) ON DELETE CASCADE,
      source_subnet_id TEXT REFERENCES ipmgt_subnets(id) ON DELETE CASCADE,
      source_text TEXT,
      translated_address TEXT NOT NULL,
      protocol TEXT,
      port TEXT,
      device_id TEXT REFERENCES ipmgt_devices(id) ON DELETE SET NULL,
      description TEXT,
      customer_id TEXT REFERENCES ipmgt_customers(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_nat_source_ip ON ipmgt_nat_rules(source_ip_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_nat_source_subnet ON ipmgt_nat_rules(source_subnet_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_nat_device ON ipmgt_nat_rules(device_id);

    -- IPAM Module (Phase 10): encrypted vault for infrastructure secrets
    -- (passwords, API credentials, certificates, notes). value_enc is
    -- AES-256-GCM ciphertext (secretCrypto.ts) - list/detail responses never
    -- include it; only the dedicated reveal endpoint decrypts, and every
    -- reveal is logged to ipmgt_vault_access_log.
    CREATE TABLE IF NOT EXISTS ipmgt_vault_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'password',
      value_enc TEXT NOT NULL,
      username TEXT,
      url TEXT,
      expiry_date TEXT,
      owner TEXT,
      related_device_id TEXT REFERENCES ipmgt_devices(id) ON DELETE SET NULL,
      related_location_id TEXT REFERENCES ipmgt_locations(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      created_by TEXT,
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vault_items_device ON ipmgt_vault_items(related_device_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vault_items_expiry ON ipmgt_vault_items(expiry_date);

    CREATE TABLE IF NOT EXISTS ipmgt_vault_access_log (
      id TEXT PRIMARY KEY,
      vault_item_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vault_access_item ON ipmgt_vault_access_log(vault_item_id);
    CREATE INDEX IF NOT EXISTS idx_ipmgt_vault_access_at ON ipmgt_vault_access_log(accessed_at DESC);

    -- Backup & restore activity trail (Admin > System > Maintenance). One row
    -- per backup/restore/delete operation with its outcome - the page's
    -- "Activity Log".
    CREATE TABLE IF NOT EXISTS backup_log (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      operation TEXT NOT NULL,      -- backup | restore | delete
      target TEXT NOT NULL,         -- database (documents/index deliberately not implemented)
      filename TEXT,
      actor TEXT NOT NULL,
      size_bytes BIGINT,
      status TEXT NOT NULL,         -- success | failed
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_log_ts ON backup_log (ts DESC);

    -- SSO realm/group roles as of the user's last login, snapshotted for the
    -- User Authority report (audit review of who has access to what without
    -- requiring every user to be currently logged in).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS realm_roles TEXT;

    -- Per-app tier directly assigned to a LOCAL user (JSON: {"docker":"operator",...}).
    -- SSO/LDAP users still get their tier resolved from the realm-role map
    -- (see App & Access) - this column only matters for user.source = 'local',
    -- since local accounts otherwise have zero app access (see resolveEntitlements).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS app_access TEXT;
  `

  // Remove line comments before splitting: several explanatory comments
  // contain semicolons, which are not SQL statement terminators. Keeping them
  // in the naive split would turn the text after that semicolon into invalid
  // SQL during a clean installation.
  const statements = schemaSql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => schemaScope(statement) === scope)

  for (const statement of statements) await db.query(statement)
}
