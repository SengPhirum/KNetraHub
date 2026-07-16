import type { Migration } from './types'

/**
 * Core device-administration schema: the unified device model, credential
 * profiles, locations, groups, module settings, dependencies, maintenance,
 * availability, and module-level settings.
 *
 * Credentials (snmp community / v3 auth+priv passwords, both on devices and
 * credential_profiles) are stored AES-256-GCM encrypted by the application
 * (server/utils/secretCrypto) — columns hold ciphertext, never plaintext.
 */
export const migration: Migration = {
  id: '0002_core',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.locations (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      -- set when discovery derived the location from SNMP sysLocation
      from_sys_location BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.credential_profiles (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      snmp_version TEXT NOT NULL DEFAULT 'v2c',
      snmp_community TEXT,          -- encrypted
      snmp_port INTEGER NOT NULL DEFAULT 161,
      snmp_transport TEXT NOT NULL DEFAULT 'udp4',
      snmp_context TEXT,
      v3_level TEXT,
      v3_username TEXT,
      v3_auth_protocol TEXT,
      v3_auth_password TEXT,        -- encrypted
      v3_priv_protocol TEXT,
      v3_priv_password TEXT,        -- encrypted
      -- lower = tried first during discovery credential attempts
      attempt_order INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.devices (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      hostname TEXT NOT NULL,            -- name used for SNMP/ICMP transport
      display_name TEXT,
      ip INET,                           -- resolved management address (v4 or v6)
      snmp_disabled BOOLEAN NOT NULL DEFAULT false,  -- ICMP-only device
      credential_profile_id BIGINT REFERENCES monitoring.credential_profiles(id) ON DELETE SET NULL,
      -- per-device credential override (all encrypted; NULL = use profile)
      snmp_version TEXT,
      snmp_community TEXT,
      snmp_port INTEGER,
      snmp_transport TEXT,
      snmp_context TEXT,
      v3_level TEXT,
      v3_username TEXT,
      v3_auth_protocol TEXT,
      v3_auth_password TEXT,
      v3_priv_protocol TEXT,
      v3_priv_password TEXT,
      -- detected identity
      os TEXT NOT NULL DEFAULT 'generic',
      os_version TEXT,
      hardware TEXT,
      vendor TEXT,
      serial TEXT,
      features TEXT,
      sys_name TEXT,
      sys_descr TEXT,
      sys_object_id TEXT,
      sys_contact TEXT,
      sys_location TEXT,
      uptime_seconds BIGINT,
      last_reboot_at TIMESTAMPTZ,
      -- overrides (never clobbered by discovery when set)
      os_override TEXT,
      hardware_override TEXT,
      -- state
      status TEXT NOT NULL DEFAULT 'pending',
      status_reason TEXT,
      icmp_status TEXT NOT NULL DEFAULT 'unknown',
      snmp_status TEXT NOT NULL DEFAULT 'unknown',
      last_ping_at TIMESTAMPTZ,
      last_ping_ms DOUBLE PRECISION,
      -- admin
      disabled BOOLEAN NOT NULL DEFAULT false,
      ignored BOOLEAN NOT NULL DEFAULT false,
      location_id BIGINT REFERENCES monitoring.locations(id) ON DELETE SET NULL,
      poller_group INTEGER NOT NULL DEFAULT 0,
      port_association_mode TEXT NOT NULL DEFAULT 'ifIndex', -- ifIndex|ifName|ifDescr|ifAlias
      poll_interval_seconds INTEGER,      -- NULL = global default
      discovery_interval_seconds INTEGER, -- NULL = global default
      notes TEXT,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      -- scheduling bookkeeping (dispatcher reads these)
      next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      next_discovery_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_polled_at TIMESTAMPTZ,
      last_poll_duration_ms INTEGER,
      last_discovered_at TIMESTAMPTZ,
      last_discovery_duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_devices_hostname ON monitoring.devices (lower(hostname))`,
    `CREATE INDEX IF NOT EXISTS idx_mon_devices_status ON monitoring.devices (status)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_devices_next_poll ON monitoring.devices (next_poll_at) WHERE NOT disabled`,
    `CREATE INDEX IF NOT EXISTS idx_mon_devices_next_disc ON monitoring.devices (next_discovery_at) WHERE NOT disabled`,

    `CREATE TABLE IF NOT EXISTS monitoring.device_groups (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      -- NULL = static membership; otherwise a structured rule tree evaluated
      -- against device fields (same JSON grammar as alert rules)
      rules JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.device_group_members (
      group_id BIGINT NOT NULL REFERENCES monitoring.device_groups(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      -- true when placed by a dynamic rule evaluation (refreshed automatically)
      dynamic BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (group_id, device_id)
    )`,

    // module enable/disable at three override levels; precedence is
    // device > device-group > OS definition > global default (in code)
    `CREATE TABLE IF NOT EXISTS monitoring.module_settings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      scope TEXT NOT NULL,               -- 'global' | 'os' | 'group' | 'device'
      scope_ref TEXT NOT NULL DEFAULT '',-- os name / group id / device id ('' for global)
      phase TEXT NOT NULL,               -- 'discovery' | 'poll'
      module TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      UNIQUE (scope, scope_ref, phase, module)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.device_dependencies (
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      parent_device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      PRIMARY KEY (device_id, parent_device_id),
      CHECK (device_id <> parent_device_id)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.maintenance_windows (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      -- behaviour: 'skip_alerts' (poll but suppress alerts) or 'skip_polling'
      behavior TEXT NOT NULL DEFAULT 'skip_alerts',
      recurrence TEXT,                   -- NULL = one-shot; 'daily'|'weekly'|'monthly'
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.maintenance_targets (
      window_id BIGINT NOT NULL REFERENCES monitoring.maintenance_windows(id) ON DELETE CASCADE,
      -- exactly one of device_id / group_id / location_id is set
      device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      group_id BIGINT REFERENCES monitoring.device_groups(id) ON DELETE CASCADE,
      location_id BIGINT REFERENCES monitoring.locations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_maint_targets_window ON monitoring.maintenance_targets (window_id)`,

    // Availability: rolling outage log + daily rollups derived from it.
    `CREATE TABLE IF NOT EXISTS monitoring.device_outages (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      going_down_at TIMESTAMPTZ NOT NULL,
      up_again_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_outages_device ON monitoring.device_outages (device_id, going_down_at DESC)`,
    `CREATE TABLE IF NOT EXISTS monitoring.device_availability (
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      duration TEXT NOT NULL,            -- '1d' | '7d' | '30d' | '365d'
      availability_percent DOUBLE PRECISION NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (device_id, duration)
    )`,

    // Free-form module settings (retention overrides, receiver toggles, ...)
    `CREATE TABLE IF NOT EXISTS monitoring.settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  ]
}
