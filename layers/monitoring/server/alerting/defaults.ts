import { getMonitoringDb as getDb } from '~~/server/utils/moduleDb'
import { DEFAULT_TITLE_TEMPLATE, DEFAULT_BODY_TEMPLATE } from './templates'

/**
 * Idempotent default alert configuration — rules and a template only, never
 * devices or fake data. Mirrors LibreNMS's stock rules: device down, port
 * down, sensor critical, service critical, BGP session down, storage full.
 */
export async function ensureDefaultAlertConfig(): Promise<void> {
  const db = getDb()

  const tpl = await db.query(`SELECT count(*)::int AS c FROM monitoring.alert_templates`)
  if (Number(tpl.rows[0].c) === 0) {
    await db.query(
      `INSERT INTO monitoring.alert_templates (name, title_template, body_template, is_default)
       VALUES ('Default', $1, $2, true)`,
      [DEFAULT_TITLE_TEMPLATE, DEFAULT_BODY_TEMPLATE]
    )
  }

  const rules = await db.query(`SELECT count(*)::int AS c FROM monitoring.alert_rules`)
  if (Number(rules.rows[0].c) > 0) return

  const defaults: [string, string, string, object, number][] = [
    // name, severity, entity_type, conditions, delay_seconds
    ['Device down', 'critical', 'device',
      { op: 'and', conditions: [{ field: 'status', cmp: 'eq', value: 'down' }] }, 60],
    ['Device degraded (SNMP unreachable)', 'warning', 'device',
      { op: 'and', conditions: [{ field: 'status', cmp: 'eq', value: 'degraded' }] }, 300],
    ['Port down (was up)', 'warning', 'port',
      { op: 'and', conditions: [
        { field: 'oper_status', cmp: 'eq', value: 'down' },
        { field: 'admin_status', cmp: 'eq', value: 'up' }
      ] }, 120],
    ['Sensor critical', 'critical', 'sensor',
      { op: 'and', conditions: [{ field: 'status', cmp: 'eq', value: 'critical' }] }, 0],
    ['Processor high (>90%)', 'warning', 'processor',
      { op: 'and', conditions: [{ field: 'usage_percent', cmp: 'gt', value: 90 }] }, 600],
    ['Memory high (>90%)', 'warning', 'mempool',
      { op: 'and', conditions: [
        { field: 'usage_percent', cmp: 'gt', value: 90 },
        { field: 'is_swap', cmp: 'eq', value: false }
      ] }, 600],
    ['Storage nearly full (>90%)', 'warning', 'storage',
      { op: 'and', conditions: [{ field: 'usage_percent', cmp: 'gt', value: 90 }] }, 0],
    ['Service critical', 'critical', 'service',
      { op: 'and', conditions: [{ field: 'status', cmp: 'eq', value: 'critical' }] }, 60],
    ['BGP session down', 'critical', 'bgp_peer',
      { op: 'and', conditions: [
        { field: 'state', cmp: 'ne', value: 'established' },
        { field: 'admin_status', cmp: 'eq', value: 'start' }
      ] }, 120]
  ]
  for (const [name, severity, entityType, conditions, delay] of defaults) {
    await db.query(
      `INSERT INTO monitoring.alert_rules (name, severity, entity_type, conditions, delay_seconds, interval_seconds)
       VALUES ($1,$2,$3,$4,$5, 3600) ON CONFLICT (name) DO NOTHING`,
      [name, severity, entityType, JSON.stringify(conditions), delay]
    )
  }
  console.log('[monitoring] seeded default alert rules + template (config only)')
}
