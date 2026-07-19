import type { Migration } from './types'

/**
 * HOST-RESOURCES-MIB hrDeviceTable inventory (LibreNMS "Inventory" tab):
 * one row per hardware device the agent reports — processors, network
 * interfaces, disks, coprocessors… Network rows are matched to
 * monitoring.ports so the UI can link them and show traffic sparklines.
 * Carries the standard reconciliation lifecycle columns.
 */
export const migration: Migration = {
  id: '0010_hr_devices',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.hr_devices (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES monitoring.devices(id) ON DELETE CASCADE,
      hr_index INTEGER NOT NULL,
      descr TEXT,
      hr_type TEXT,                      -- hrDeviceProcessor|hrDeviceNetwork|…
      status TEXT,                       -- unknown|running|warning|testing|down
      errors NUMERIC,
      load_percent DOUBLE PRECISION,     -- hrProcessorLoad for processor rows
      port_id BIGINT REFERENCES monitoring.ports(id) ON DELETE SET NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stale_since TIMESTAMPTZ,
      stale_misses INTEGER NOT NULL DEFAULT 0,
      UNIQUE (device_id, hr_index)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mon_hr_devices_device ON monitoring.hr_devices (device_id)`
  ]
}
