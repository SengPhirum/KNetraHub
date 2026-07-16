import type { Migration } from './types'

/**
 * Events, syslog, SNMP traps, and the full alerting pipeline:
 * rules → evaluation → incidents (alerts) → transitions (alert_log)
 * → notifications (alert_notifications, redacted).
 */
export const migration: Migration = {
  id: '0006_events_alerts',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      entity_type TEXT,                  -- device|port|sensor|service|…
      entity_id BIGINT,
      event_type TEXT NOT NULL,          -- device_up|device_down|port_up|port_down|sensor_warning|discovery|config|trap|…
      severity TEXT NOT NULL DEFAULT 'info', -- info|warning|error
      message TEXT NOT NULL,
      detail JSONB
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_events_device ON monitoring.events (device_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_events_time ON monitoring.events (created_at DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.syslog (
      time TIMESTAMPTZ NOT NULL DEFAULT now(),
      device_id BIGINT,
      source_ip INET,
      facility SMALLINT,
      severity SMALLINT,
      hostname TEXT,
      app_name TEXT,
      proc_id TEXT,
      msg_id TEXT,
      message TEXT NOT NULL,
      structured_data JSONB,
      rfc TEXT                            -- '3164' | '5424' | 'raw'
    )`,
    `SELECT create_hypertable('monitoring.syslog', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_syslog_device ON monitoring.syslog (device_id, time DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_syslog_severity ON monitoring.syslog (severity, time DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.traps (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      device_id BIGINT,
      source_ip INET NOT NULL,
      snmp_version TEXT,
      community_matched BOOLEAN,
      enterprise_oid TEXT,
      trap_oid TEXT,
      uptime_ticks BIGINT,
      varbinds JSONB NOT NULL DEFAULT '[]'::jsonb,
      handler TEXT,                      -- registry handler that processed it (NULL = unknown trap)
      handler_result TEXT,
      event_id BIGINT,
      error TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_traps_time ON monitoring.traps (received_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_traps_device ON monitoring.traps (device_id, received_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_traps_oid ON monitoring.traps (trap_oid)`,

    `CREATE TABLE IF NOT EXISTS monitoring.alert_rules (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      severity TEXT NOT NULL DEFAULT 'critical',   -- warning|critical
      entity_type TEXT NOT NULL DEFAULT 'device',  -- what the conditions evaluate against
      -- structured condition tree: {"op":"and"|"or","conditions":[{"field","cmp","value"},{…nested op…}]}
      conditions JSONB NOT NULL,
      -- scope: null = all devices; otherwise any of these narrow it
      device_ids BIGINT[],
      group_ids BIGINT[],
      location_ids BIGINT[],
      -- notification behaviour
      delay_seconds INTEGER NOT NULL DEFAULT 0,        -- must stay faulting this long before notify
      interval_seconds INTEGER NOT NULL DEFAULT 0,     -- re-notify cadence (0 = once)
      max_notifications INTEGER NOT NULL DEFAULT 0,    -- 0 = unlimited
      recovery_notification BOOLEAN NOT NULL DEFAULT true,
      acknowledgeable BOOLEAN NOT NULL DEFAULT true,
      note TEXT,
      invert BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.alert_transports (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,                -- shared/constants TRANSPORT_TYPES
      enabled BOOLEAN NOT NULL DEFAULT true,
      is_default BOOLEAN NOT NULL DEFAULT false,  -- used by rules with no explicit transports
      config TEXT NOT NULL,              -- AES-256-GCM encrypted JSON
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.alert_rule_transports (
      rule_id BIGINT NOT NULL REFERENCES monitoring.alert_rules(id) ON DELETE CASCADE,
      transport_id BIGINT NOT NULL REFERENCES monitoring.alert_transports(id) ON DELETE CASCADE,
      PRIMARY KEY (rule_id, transport_id)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.alert_templates (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      title_template TEXT NOT NULL,
      body_template TEXT NOT NULL,       -- safe {{ path }} interpolation only
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='monitoring' AND table_name='alert_rules' AND column_name='template_id') THEN
        ALTER TABLE monitoring.alert_rules ADD COLUMN template_id BIGINT REFERENCES monitoring.alert_templates(id) ON DELETE SET NULL;
      END IF;
    END $$`,

    // Alert incidents — one open row per (rule, device, entity)
    `CREATE TABLE IF NOT EXISTS monitoring.alerts (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      rule_id BIGINT NOT NULL REFERENCES monitoring.alert_rules(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL DEFAULT 'device',
      entity_id BIGINT NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'open',      -- open|acknowledged|recovered|suppressed|closed
      severity TEXT NOT NULL,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      recovered_at TIMESTAMPTZ,
      acked_at TIMESTAMPTZ,
      acked_by TEXT,
      ack_note TEXT,
      ack_until_recovery BOOLEAN NOT NULL DEFAULT true,  -- sticky ack
      suppressed_reason TEXT,                  -- maintenance|dependency
      notifications_sent INTEGER NOT NULL DEFAULT 0,
      last_notified_at TIMESTAMPTZ,
      faulting JSONB                            -- snapshot of faulting entity values
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mon_alerts_open ON monitoring.alerts (rule_id, device_id, entity_type, entity_id) WHERE state IN ('open','acknowledged','suppressed')`,
    `CREATE INDEX IF NOT EXISTS idx_mon_alerts_state ON monitoring.alerts (state, opened_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_alerts_device ON monitoring.alerts (device_id, opened_at DESC)`,

    // Every state transition, for audit + history views
    `CREATE TABLE IF NOT EXISTS monitoring.alert_log (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      alert_id BIGINT NOT NULL REFERENCES monitoring.alerts(id) ON DELETE CASCADE,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_state TEXT,
      to_state TEXT NOT NULL,
      actor TEXT,                        -- username or 'system'
      note TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_alert_log ON monitoring.alert_log (alert_id, at DESC)`,

    // Delivery attempts (redacted request; never contains transport secrets)
    `CREATE TABLE IF NOT EXISTS monitoring.alert_notifications (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      alert_id BIGINT NOT NULL REFERENCES monitoring.alerts(id) ON DELETE CASCADE,
      transport_id BIGINT REFERENCES monitoring.alert_transports(id) ON DELETE SET NULL,
      transport_type TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'alert',      -- alert|recovery|reminder|test
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      target TEXT,                             -- rendered, redacted destination
      request_summary TEXT,                    -- redacted
      response_status INTEGER,
      response_ms INTEGER,
      retries INTEGER NOT NULL DEFAULT 0,
      success BOOLEAN NOT NULL,
      error TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_alert_notif ON monitoring.alert_notifications (alert_id, attempted_at DESC)`
  ],
  tolerant: ['create_hypertable']
}
