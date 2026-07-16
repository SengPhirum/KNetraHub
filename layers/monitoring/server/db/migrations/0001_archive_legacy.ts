import type { Migration } from './types'

/**
 * Archive the pre-rebuild monitoring tables (public.net_* / public.server_*)
 * on databases that still have them. Fresh installs never create these (the
 * bootstrap DDL was deleted with the legacy module), so on a fresh database
 * this migration is a no-op.
 *
 * Tables are MOVED to the monitoring_legacy_archive schema, not dropped —
 * recovery/reference per docs/monitoring/legacy-monitoring-removal-report.md.
 * The final, irreversible cleanup is an explicit operator action once the
 * archive is confirmed unneeded:
 *
 *   DROP SCHEMA monitoring_legacy_archive CASCADE;
 */
const LEGACY_TABLES = [
  // net domain (children before parents is irrelevant for ALTER SET SCHEMA)
  'net_device_groups', 'net_interfaces', 'net_sensors', 'net_alerts',
  'net_alert_rules', 'net_syslog', 'net_backups', 'net_flows',
  'net_discovery_jobs', 'net_reports', 'net_dashboards',
  'net_device_templates', 'net_groups', 'net_devices', 'net_probes',
  // server (Zabbix-model) domain
  'server_web_steps', 'server_web_scenarios', 'server_services',
  'server_problems', 'server_triggers', 'server_items',
  'server_host_group_members', 'server_host_interfaces',
  'server_host_templates', 'server_template_triggers',
  'server_template_items', 'server_templates', 'server_hosts',
  'server_host_groups', 'server_maintenance', 'server_actions',
  'server_maps', 'server_discovery_rules', 'server_discovery_jobs',
  'server_traps',
  // legacy hypertables
  'net_metrics', 'net_sensor_readings', 'server_item_history'
]

export const migration: Migration = {
  id: '0001_archive_legacy',
  statements: [
    'CREATE SCHEMA IF NOT EXISTS monitoring_legacy_archive',
    ...LEGACY_TABLES.map(
      (t) => `DO $$ BEGIN
        IF to_regclass('public.${t}') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public.${t} SET SCHEMA monitoring_legacy_archive';
        END IF;
      END $$;`
    ),
    // Drop the archive schema again if it ended up empty (fresh install).
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'monitoring_legacy_archive'
      ) THEN
        EXECUTE 'DROP SCHEMA IF EXISTS monitoring_legacy_archive';
      END IF;
    END $$;`
  ],
  // Timescale can refuse SET SCHEMA on hypertables in some versions; the
  // archive must not block the rebuild — those tables then stay in public
  // and are listed for manual archival in the removal report.
  tolerant: ['net_metrics', 'net_sensor_readings', 'server_item_history']
}
