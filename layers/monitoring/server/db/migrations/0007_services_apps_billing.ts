import type { Migration } from './types'

/**
 * Active service checks, application monitoring, traffic billing, and
 * dashboards.
 */
export const migration: Migration = {
  id: '0007_services_apps_billing',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.services (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,                -- shared/constants SERVICE_TYPES
      -- validated per-type parameters (host/port/url/expect/…); no shell strings
      params JSONB NOT NULL DEFAULT '{}'::jsonb,
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      retry_interval_seconds INTEGER NOT NULL DEFAULT 60,
      timeout_ms INTEGER NOT NULL DEFAULT 10000,
      warn_response_ms INTEGER,
      crit_response_ms INTEGER,
      enabled BOOLEAN NOT NULL DEFAULT true,
      poller_group INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',  -- ok|warning|critical|unknown
      status_message TEXT,
      last_check_at TIMESTAMPTZ,
      last_response_ms DOUBLE PRECISION,
      next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_services_device ON monitoring.services (device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_services_due ON monitoring.services (next_check_at) WHERE enabled`,

    `CREATE TABLE IF NOT EXISTS monitoring.applications (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      app_type TEXT NOT NULL,            -- collector id from the application registry
      instance TEXT NOT NULL DEFAULT '', -- multi-instance apps (e.g. two postgres clusters)
      enabled BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'unknown',
      status_message TEXT,
      last_collected_at TIMESTAMPTZ,
      data JSONB,                        -- latest parsed metric snapshot
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (device_id, app_type, instance)
    )`,

    // Billing: quota / 95th-percentile on selected ports
    `CREATE TABLE IF NOT EXISTS monitoring.bills (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      bill_type TEXT NOT NULL DEFAULT 'quota',   -- quota|cdr (95th percentile)
      direction TEXT NOT NULL DEFAULT 'sum',     -- in|out|max|sum
      quota_bytes NUMERIC,                       -- for quota bills
      cdr_bps NUMERIC,                           -- committed rate for cdr bills
      bill_day INTEGER NOT NULL DEFAULT 1,       -- day of month the period starts
      timezone TEXT NOT NULL DEFAULT 'UTC',
      contact TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.bill_ports (
      bill_id BIGINT NOT NULL REFERENCES monitoring.bills(id) ON DELETE CASCADE,
      port_id BIGINT NOT NULL REFERENCES monitoring.ports(id) ON DELETE CASCADE,
      PRIMARY KEY (bill_id, port_id)
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring.bill_history (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      bill_id BIGINT NOT NULL REFERENCES monitoring.bills(id) ON DELETE CASCADE,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      in_bytes NUMERIC NOT NULL DEFAULT 0,
      out_bytes NUMERIC NOT NULL DEFAULT 0,
      total_bytes NUMERIC NOT NULL DEFAULT 0,
      percentile_95_bps NUMERIC,
      overage_bytes NUMERIC,
      closed BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (bill_id, period_start)
    )`,

    `CREATE TABLE IF NOT EXISTS monitoring.dashboards (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner TEXT NOT NULL,               -- portal user id; '' = global
      name TEXT NOT NULL,
      shared TEXT NOT NULL DEFAULT 'private',  -- private|read|edit
      is_default BOOLEAN NOT NULL DEFAULT false,
      layout JSONB NOT NULL DEFAULT '[]'::jsonb, -- widget grid: [{i,x,y,w,h,type,config}]
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (owner, name)
    )`
  ]
}
