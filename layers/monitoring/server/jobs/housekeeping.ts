import { getDb } from '~~/server/utils/db'
import { purgeStaleEntities } from '../core/reconcile'
import { trimFinishedJobs } from './queue'

/**
 * Daily housekeeping: retention trimming, stale-entity purge (only after the
 * confirmed-absent threshold), availability rollups, and dynamic device-group
 * refresh. Runs as a singleton queue job.
 */
export async function runHousekeeping(): Promise<void> {
  const db = getDb()
  const rc = useRuntimeConfig().monitoring as Record<string, any>

  // ── Retention (SQL deletes; Timescale drop_chunks would also work) ──
  const retention: [string, string, number][] = [
    ['monitoring.port_metrics', 'time', Number(rc.metricRetentionDays ?? 30)],
    ['monitoring.sensor_metrics', 'time', Number(rc.metricRetentionDays ?? 30)],
    ['monitoring.metrics', 'time', Number(rc.metricRetentionDays ?? 30)],
    ['monitoring.service_results', 'time', Number(rc.metricRetentionDays ?? 30)],
    ['monitoring.syslog', 'time', Number(rc.syslogRetentionDays ?? 30)],
    ['monitoring.collection_attempts', 'time', Number(rc.jobRunRetentionDays ?? 7)]
  ]
  for (const [table, column, days] of retention) {
    try {
      await db.query(`DELETE FROM ${table} WHERE ${column} < now() - make_interval(days => $1)`, [days])
    } catch (err) {
      console.error(`[monitoring:housekeeping] retention trim failed for ${table}`, err)
    }
  }
  await db.query(`DELETE FROM monitoring.events WHERE created_at < now() - make_interval(days => $1)`, [Number(rc.eventRetentionDays ?? 90)])
  await db.query(`DELETE FROM monitoring.traps WHERE received_at < now() - make_interval(days => $1)`, [Number(rc.trapRetentionDays ?? 30)])
  await db.query(`DELETE FROM monitoring.poll_runs WHERE started_at < now() - make_interval(days => $1)`, [Number(rc.jobRunRetentionDays ?? 7)])
  await trimFinishedJobs(db, 2)

  // ── Stale entity purge (repeatedly-confirmed-absent only) ──
  for (const table of [
    'monitoring.ports', 'monitoring.sensors', 'monitoring.processors', 'monitoring.mempools',
    'monitoring.storage', 'monitoring.inventory', 'monitoring.ipv4_addresses', 'monitoring.ipv6_addresses',
    'monitoring.arp_entries', 'monitoring.fdb_entries', 'monitoring.vlans', 'monitoring.bgp_peers',
    'monitoring.ospf_neighbors', 'monitoring.topology_links', 'monitoring.wireless_sensors'
  ]) {
    try {
      const purged = await purgeStaleEntities(db, table)
      if (purged) console.log(`[monitoring:housekeeping] purged ${purged} confirmed-stale rows from ${table}`)
    } catch (err) {
      console.error(`[monitoring:housekeeping] stale purge failed for ${table}`, err)
    }
  }

  // ── Availability rollups from the outage log ──
  const windows: [string, number][] = [['1d', 1], ['7d', 7], ['30d', 30], ['365d', 365]]
  const devices = await db.query(`SELECT id, created_at FROM monitoring.devices WHERE NOT disabled`)
  for (const device of devices.rows) {
    for (const [label, days] of windows) {
      const res = await db.query(
        `SELECT COALESCE(SUM(
           EXTRACT(EPOCH FROM (LEAST(COALESCE(up_again_at, now()), now()) -
                               GREATEST(going_down_at, now() - make_interval(days => $2))))
         ), 0) AS downtime
         FROM monitoring.device_outages
         WHERE device_id = $1 AND COALESCE(up_again_at, now()) > now() - make_interval(days => $2)`,
        [device.id, days]
      )
      const windowSeconds = Math.min(days * 86400, Math.max(1, (Date.now() - new Date(device.created_at).getTime()) / 1000))
      const downtime = Math.min(Number(res.rows[0].downtime ?? 0), windowSeconds)
      const pct = ((windowSeconds - downtime) / windowSeconds) * 100
      await db.query(
        `INSERT INTO monitoring.device_availability (device_id, duration, availability_percent, computed_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (device_id, duration) DO UPDATE SET availability_percent = $3, computed_at = now()`,
        [device.id, label, pct]
      )
    }
  }

  // ── Dynamic device-group membership refresh ──
  const groups = await db.query(`SELECT id, rules FROM monitoring.device_groups WHERE rules IS NOT NULL`)
  if (groups.rows.length) {
    const { evaluateConditions } = await import('../alerting/conditions')
    const allDevices = await db.query(`SELECT * FROM monitoring.devices`)
    for (const group of groups.rows) {
      const matching = allDevices.rows.filter((d: any) => {
        try {
          return evaluateConditions(group.rules, d)
        } catch {
          return false
        }
      })
      await db.query(`DELETE FROM monitoring.device_group_members WHERE group_id = $1 AND dynamic`, [group.id])
      for (const device of matching) {
        await db.query(
          `INSERT INTO monitoring.device_group_members (group_id, device_id, dynamic) VALUES ($1,$2,true)
           ON CONFLICT DO NOTHING`,
          [group.id, device.id]
        )
      }
    }
  }

  console.log('[monitoring:housekeeping] done')
}
