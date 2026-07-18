import type { Migration } from './types'

/**
 * Device type taxonomy: `device_type` is what discovery detected from the OS
 * definition; `device_type_override` is a manual operator choice that
 * detection never overwrites. Effective type = COALESCE(override, detected,
 * 'server').
 */
export const migration: Migration = {
  id: '0009_device_type',
  statements: [
    `ALTER TABLE monitoring.devices ADD COLUMN IF NOT EXISTS device_type TEXT`,
    `ALTER TABLE monitoring.devices ADD COLUMN IF NOT EXISTS device_type_override TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_mon_devices_type ON monitoring.devices (device_type)`
  ]
}
