import type { Pool } from 'pg'
import { getDb } from '~~/server/utils/db'
import { evaluateConditions } from './conditions'
import { activeMaintenance } from '../core/moduleSettings'
import { recordEvent } from '../core/events'
import { deliverAlert } from './transports'

/**
 * Alert evaluation (runs every minute as a singleton queue job):
 *   rule → entity snapshots → faulting set → incident open/refresh/recover →
 *   suppression (maintenance, dependency, ack) → notification scheduling.
 */

const ENTITY_QUERIES: Record<string, string> = {
  device: `SELECT d.*, d.id AS device_id, 0 AS entity_id, l.name AS location
           FROM monitoring.devices d LEFT JOIN monitoring.locations l ON l.id = d.location_id
           WHERE NOT d.disabled AND NOT d.ignored`,
  port: `SELECT p.*, p.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status, d.os,
                m.in_bps, m.out_bps, m.in_util_percent, m.out_util_percent,
                m.in_errors_ps, m.out_errors_ps, m.in_discards_ps, m.out_discards_ps
         FROM monitoring.ports p JOIN monitoring.devices d ON d.id = p.device_id
         LEFT JOIN LATERAL (
           SELECT * FROM monitoring.port_metrics WHERE port_id = p.id ORDER BY time DESC LIMIT 1
         ) m ON true
         WHERE NOT d.disabled AND NOT d.ignored AND NOT p.disabled AND NOT p.ignored AND p.stale_since IS NULL`,
  sensor: `SELECT s.*, s.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status, d.os
           FROM monitoring.sensors s JOIN monitoring.devices d ON d.id = s.device_id
           WHERE NOT d.disabled AND NOT d.ignored AND s.stale_since IS NULL`,
  processor: `SELECT p.*, p.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status
              FROM monitoring.processors p JOIN monitoring.devices d ON d.id = p.device_id
              WHERE NOT d.disabled AND p.stale_since IS NULL`,
  mempool: `SELECT m.*, m.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status
            FROM monitoring.mempools m JOIN monitoring.devices d ON d.id = m.device_id
            WHERE NOT d.disabled AND m.stale_since IS NULL`,
  storage: `SELECT s.*, s.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status
            FROM monitoring.storage s JOIN monitoring.devices d ON d.id = s.device_id
            WHERE NOT d.disabled AND s.stale_since IS NULL`,
  service: `SELECT s.*, s.id AS entity_id, COALESCE(s.device_id, 0) AS device_id, s.status AS service_status
            FROM monitoring.services s WHERE s.enabled`,
  bgp_peer: `SELECT b.*, b.id AS entity_id, d.id AS device_id, d.hostname, d.status AS device_status
             FROM monitoring.bgp_peers b JOIN monitoring.devices d ON d.id = b.device_id
             WHERE NOT d.disabled AND b.stale_since IS NULL`
}

export async function evaluateAlertRules(): Promise<void> {
  const db = getDb()
  const rules = await db.query(`SELECT * FROM monitoring.alert_rules WHERE enabled`)
  if (!rules.rows.length) return

  // Snapshot caches per entity type (rules share them within one evaluation).
  const snapshots = new Map<string, Record<string, unknown>[]>()
  const getSnapshot = async (entityType: string) => {
    if (!snapshots.has(entityType)) {
      const sql = ENTITY_QUERIES[entityType]
      snapshots.set(entityType, sql ? (await db.query(sql)).rows : [])
    }
    return snapshots.get(entityType)!
  }

  for (const rule of rules.rows) {
    try {
      await evaluateRule(db, rule, await getSnapshot(rule.entity_type))
    } catch (err) {
      console.error(`[monitoring:alerts] rule "${rule.name}" evaluation failed`, err)
    }
  }
}

async function evaluateRule(db: Pool, rule: any, entities: Record<string, unknown>[]): Promise<void> {
  // Scope narrowing
  let scoped = entities
  if (rule.device_ids?.length) {
    const set = new Set(rule.device_ids.map(Number))
    scoped = scoped.filter((e) => set.has(Number(e.device_id)))
  }
  if (rule.group_ids?.length) {
    const members = await db.query(
      `SELECT DISTINCT device_id FROM monitoring.device_group_members WHERE group_id = ANY($1::bigint[])`,
      [rule.group_ids]
    )
    const set = new Set(members.rows.map((r: any) => Number(r.device_id)))
    scoped = scoped.filter((e) => set.has(Number(e.device_id)))
  }
  if (rule.location_ids?.length) {
    const devs = await db.query(
      `SELECT id FROM monitoring.devices WHERE location_id = ANY($1::bigint[])`,
      [rule.location_ids]
    )
    const set = new Set(devs.rows.map((r: any) => Number(r.id)))
    scoped = scoped.filter((e) => set.has(Number(e.device_id)))
  }

  let faulting = scoped.filter((e) => evaluateConditions(rule.conditions, e))
  if (rule.invert) {
    const faultKeys = new Set(faulting.map((e) => `${e.device_id}:${e.entity_id}`))
    faulting = scoped.filter((e) => !faultKeys.has(`${e.device_id}:${e.entity_id}`))
  }
  const faultKeys = new Set(faulting.map((e) => `${Number(e.device_id)}:${Number(e.entity_id ?? 0)}`))

  // Open/refresh incidents for faulting entities
  for (const entity of faulting) {
    const deviceId = Number(entity.device_id)
    const entityId = Number(entity.entity_id ?? 0)
    if (!deviceId) continue

    const existing = await db.query(
      `SELECT * FROM monitoring.alerts
       WHERE rule_id = $1 AND device_id = $2 AND entity_type = $3 AND entity_id = $4
         AND state IN ('open','acknowledged','suppressed')`,
      [rule.id, deviceId, rule.entity_type, entityId]
    )

    // Suppression checks
    const maint = await activeMaintenance(db, deviceId)
    const parentDown = await dependencyParentDown(db, deviceId)
    const suppressReason = maint ? 'maintenance' : parentDown ? 'dependency' : null

    if (!existing.rows.length) {
      const ins = await db.query(
        `INSERT INTO monitoring.alerts (rule_id, device_id, entity_type, entity_id, state, severity, suppressed_reason, faulting)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [rule.id, deviceId, rule.entity_type, entityId,
          suppressReason ? 'suppressed' : 'open', rule.severity, suppressReason, JSON.stringify(snapshotOf(entity))]
      )
      const alertId = Number(ins.rows[0].id)
      await db.query(
        `INSERT INTO monitoring.alert_log (alert_id, from_state, to_state, actor, note) VALUES ($1,NULL,$2,'system',$3)`,
        [alertId, suppressReason ? 'suppressed' : 'open', `rule "${rule.name}" matched`]
      )
      await recordEvent(db, {
        deviceId, entityType: rule.entity_type, entityId,
        eventType: 'alert_open', severity: rule.severity === 'critical' ? 'error' : 'warning',
        message: `Alert: ${rule.name}${suppressReason ? ` (suppressed: ${suppressReason})` : ''}`
      })
      continue
    }

    const alert = existing.rows[0]
    await db.query(`UPDATE monitoring.alerts SET last_seen_at = now(), faulting = $2 WHERE id = $1`, [alert.id, JSON.stringify(snapshotOf(entity))])

    // Un-suppress if the suppression cause cleared
    if (alert.state === 'suppressed' && !suppressReason) {
      await transition(db, alert.id, 'suppressed', 'open', 'suppression cleared')
      alert.state = 'open'
    }

    // Notification scheduling
    if (alert.state === 'open' && !suppressReason) {
      const ageSeconds = (Date.now() - new Date(alert.opened_at).getTime()) / 1000
      if (ageSeconds < Number(rule.delay_seconds ?? 0)) continue
      const maxN = Number(rule.max_notifications ?? 0)
      if (maxN > 0 && Number(alert.notifications_sent) >= maxN) continue
      const interval = Number(rule.interval_seconds ?? 0)
      const lastAt = alert.last_notified_at ? new Date(alert.last_notified_at).getTime() : 0
      const due = !lastAt || (interval > 0 && Date.now() - lastAt >= interval * 1000)
      if (due) {
        await deliverAlert(db, { alert, rule, kind: alert.notifications_sent > 0 ? 'reminder' : 'alert' })
      }
    }
  }

  // Recover incidents whose entity no longer faults
  const openAlerts = await db.query(
    `SELECT * FROM monitoring.alerts WHERE rule_id = $1 AND state IN ('open','acknowledged','suppressed')`,
    [rule.id]
  )
  for (const alert of openAlerts.rows) {
    if (faultKeys.has(`${Number(alert.device_id)}:${Number(alert.entity_id)}`)) continue
    await db.query(
      `UPDATE monitoring.alerts SET state = 'recovered', recovered_at = now() WHERE id = $1`,
      [alert.id]
    )
    await transition(db, alert.id, alert.state, 'recovered', 'condition cleared')
    await recordEvent(db, {
      deviceId: Number(alert.device_id), entityType: alert.entity_type, entityId: Number(alert.entity_id),
      eventType: 'alert_recovered', message: `Alert recovered: ${rule.name}`
    })
    if (rule.recovery_notification && alert.state !== 'suppressed' && Number(alert.notifications_sent) > 0) {
      await deliverAlert(db, { alert, rule, kind: 'recovery' })
    }
  }
}

async function dependencyParentDown(db: Pool, deviceId: number): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM monitoring.device_dependencies dd
     JOIN monitoring.devices parent ON parent.id = dd.parent_device_id
     WHERE dd.device_id = $1 AND parent.status = 'down' LIMIT 1`,
    [deviceId]
  )
  return res.rows.length > 0
}

async function transition(db: Pool, alertId: number, from: string, to: string, note: string): Promise<void> {
  await db.query(
    `UPDATE monitoring.alerts SET state = $2 WHERE id = $1`,
    [alertId, to]
  )
  await db.query(
    `INSERT INTO monitoring.alert_log (alert_id, from_state, to_state, actor, note) VALUES ($1,$2,$3,'system',$4)`,
    [alertId, from, to, note]
  )
}

/** Keep the persisted faulting snapshot small and secret-free. */
function snapshotOf(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (/community|password|secret|token/.test(key)) continue
    if (value == null || typeof value === 'object') continue
    out[key] = value
    if (Object.keys(out).length >= 40) break
  }
  return out
}
