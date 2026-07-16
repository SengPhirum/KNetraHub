import type { Migration } from './types'

/**
 * Discovered-entity schema: everything discovery reconciles and polling
 * collects. Every entity table carries the reconciliation lifecycle columns:
 *   discovered_at  — first seen
 *   updated_at     — last time discovery/polling touched it
 *   stale_since    — set when a successful discovery no longer sees it
 *   stale_misses   — consecutive discoveries that confirmed absence
 * Entities are archived/deleted by housekeeping only after stale_misses
 * exceeds the configured threshold — never by a single failed walk.
 */
export const migration: Migration = {
  id: '0003_entities',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.ports (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      if_index INTEGER NOT NULL,
      if_name TEXT,
      if_descr TEXT,
      if_alias TEXT,
      if_type TEXT,
      mac_address TEXT,
      mtu INTEGER,
      speed_bps BIGINT,            -- effective speed (ifHighSpeed*1e6 preferred)
      duplex TEXT,
      admin_status TEXT,           -- up|down|testing
      oper_status TEXT,            -- up|down|testing|unknown|dormant|notPresent|lowerLayerDown
      last_change_at TIMESTAMPTZ,
      disabled BOOLEAN NOT NULL DEFAULT false,  -- exclude from polling
      ignored BOOLEAN NOT NULL DEFAULT false,   -- exclude from alerting
      port_group TEXT,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, if_index)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_ports_device ON monitoring.ports (device_id)`,

    // Counter baselines for delta/rate computation, one row per port. Raw
    // counters are BIGINT-safe as NUMERIC (Counter64 exceeds JS/BIGINT-safe
    // arithmetic is fine in Postgres; app converts via BigInt).
    `CREATE TABLE IF NOT EXISTS monitoring.port_counters (
      port_id BIGINT PRIMARY KEY REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      polled_at TIMESTAMPTZ NOT NULL,
      device_uptime_seconds BIGINT,
      in_octets NUMERIC, out_octets NUMERIC,
      in_ucast NUMERIC, out_ucast NUMERIC,
      in_mcast NUMERIC, out_mcast NUMERIC,
      in_bcast NUMERIC, out_bcast NUMERIC,
      in_errors NUMERIC, out_errors NUMERIC,
      in_discards NUMERIC, out_discards NUMERIC,
      in_unknown_protos NUMERIC,
      counters_64bit BOOLEAN NOT NULL DEFAULT false,
      speed_bps BIGINT,
      reset_count INTEGER NOT NULL DEFAULT 0,   -- observed discontinuities
      last_reset_reason TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.port_state_log (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      port_id BIGINT NOT NULL REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      admin_status TEXT,
      oper_status TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_port_state_log ON monitoring.port_state_log (port_id, changed_at DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.ipv4_addresses (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      address INET NOT NULL,
      prefix_length INTEGER,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, address)
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.ipv6_addresses (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      address INET NOT NULL,
      prefix_length INTEGER,
      origin TEXT,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, address)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.arp_entries (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE SET NULL,
      ip INET NOT NULL,
      mac_address TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, ip, mac_address)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_arp_mac ON monitoring.arp_entries (mac_address)`,

    `CREATE TABLE IF NOT EXISTS monitoring.fdb_entries (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE SET NULL,
      vlan_id INTEGER,
      mac_address TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_fdb_identity ON monitoring.fdb_entries (device_id, mac_address, COALESCE(vlan_id, -1))`,

    `CREATE TABLE IF NOT EXISTS monitoring.vlans (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      vlan_id INTEGER NOT NULL,
      name TEXT,
      state TEXT,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, vlan_id)
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.port_vlans (
      port_id BIGINT NOT NULL REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      vlan_id INTEGER NOT NULL,
      untagged BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (port_id, vlan_id)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.sensors (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      sensor_class TEXT NOT NULL,        -- temperature|voltage|fanspeed|state|…
      sensor_oid TEXT NOT NULL,          -- numeric OID polled
      sensor_index TEXT NOT NULL,        -- source table index (string-safe)
      description TEXT NOT NULL,
      sensor_group TEXT,
      unit TEXT,
      divisor DOUBLE PRECISION NOT NULL DEFAULT 1,
      multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
      current_value DOUBLE PRECISION,
      warn_low DOUBLE PRECISION, warn_high DOUBLE PRECISION,
      crit_low DOUBLE PRECISION, crit_high DOUBLE PRECISION,
      limits_user_set BOOLEAN NOT NULL DEFAULT false,
      -- for class='state': translation map {"1":{"label":"ok","severity":"ok"},…}
      state_translations JSONB,
      entity_ref TEXT,                   -- entPhysicalIndex link where known
      status TEXT NOT NULL DEFAULT 'ok', -- ok|warning|critical|unknown
      polled_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'discovery',  -- discovery module/definition id
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, sensor_class, sensor_oid, sensor_index)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_sensors_device ON monitoring.sensors (device_id)`,

    `CREATE TABLE IF NOT EXISTS monitoring.wireless_sensors (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      wireless_class TEXT NOT NULL,      -- clients|rssi|snr|ap-count|…
      sensor_oid TEXT NOT NULL,
      sensor_index TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT,
      divisor DOUBLE PRECISION NOT NULL DEFAULT 1,
      multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
      current_value DOUBLE PRECISION,
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, wireless_class, sensor_oid, sensor_index)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.processors (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      source TEXT NOT NULL,              -- hr|ucd|vendor MIB used
      proc_oid TEXT NOT NULL,
      proc_index TEXT NOT NULL,
      description TEXT,
      usage_percent DOUBLE PRECISION,
      warn_percent DOUBLE PRECISION,
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, proc_oid, proc_index)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.mempools (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      mempool_index TEXT NOT NULL,
      description TEXT,
      total_bytes NUMERIC,
      used_bytes NUMERIC,
      free_bytes NUMERIC,
      cached_bytes NUMERIC,
      buffered_bytes NUMERIC,
      usage_percent DOUBLE PRECISION,
      warn_percent DOUBLE PRECISION,
      is_swap BOOLEAN NOT NULL DEFAULT false,
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, source, mempool_index)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.storage (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      source TEXT NOT NULL,              -- hrStorage|ucd dsk|vendor
      storage_index TEXT NOT NULL,
      description TEXT,
      storage_type TEXT,
      allocation_units INTEGER,
      total_bytes NUMERIC,
      used_bytes NUMERIC,
      free_bytes NUMERIC,
      usage_percent DOUBLE PRECISION,
      warn_percent DOUBLE PRECISION,
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, source, storage_index)
    )`,

    // ENTITY-MIB physical inventory tree
    `CREATE TABLE IF NOT EXISTS monitoring.inventory (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      ent_physical_index INTEGER NOT NULL,
      parent_index INTEGER,
      name TEXT,
      descr TEXT,
      class TEXT,                        -- chassis|module|fan|powerSupply|sensor|port|…
      serial TEXT,
      model TEXT,
      manufacturer TEXT,
      hardware_rev TEXT,
      firmware_rev TEXT,
      software_rev TEXT,
      is_fru BOOLEAN,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, ent_physical_index)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.bgp_peers (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      peer_ip INET NOT NULL,
      peer_as BIGINT,
      local_as BIGINT,
      peer_identifier TEXT,
      state TEXT,                        -- idle|connect|active|opensent|openconfirm|established
      admin_status TEXT,
      established_at TIMESTAMPTZ,
      established_seconds BIGINT,
      in_updates NUMERIC,
      out_updates NUMERIC,
      accepted_prefixes BIGINT,
      description TEXT,
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, peer_ip)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.ospf_instances (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      router_id TEXT NOT NULL,
      admin_status TEXT,
      area_count INTEGER,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, router_id)
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.ospf_neighbors (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      neighbor_ip INET NOT NULL,
      neighbor_router_id TEXT,
      state TEXT,                        -- down|attempt|init|twoWay|exchangeStart|exchange|loading|full
      polled_at TIMESTAMPTZ,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, neighbor_ip)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.stp_instances (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      protocol TEXT,
      bridge_address TEXT,
      priority INTEGER,
      root_bridge TEXT,
      root_cost INTEGER,
      is_root BOOLEAN,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_stp_identity ON monitoring.stp_instances (device_id, COALESCE(bridge_address, ''))`,

    // Topology links from LLDP/CDP discovery — real neighbor data only.
    `CREATE TABLE IF NOT EXISTS monitoring.topology_links (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      protocol TEXT NOT NULL,            -- lldp|cdp
      remote_hostname TEXT,
      remote_port TEXT,
      remote_platform TEXT,
      remote_address TEXT,
      remote_device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE SET NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_topo_identity ON monitoring.topology_links (device_id, protocol, COALESCE(port_id, -1), COALESCE(remote_hostname, ''), COALESCE(remote_port, ''))`
  ]
}
