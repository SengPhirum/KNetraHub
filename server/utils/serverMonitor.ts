import { getDb } from './db'
import { notifyChannel } from './alertNotify'
import type { HostMetrics } from './netMonitor'

/**
 * Map a Zabbix-style item key to the collected SNMP host metric. Uptime is
 * returned in seconds (from sysUpTime ticks). Unknown keys return undefined so
 * the poller can fall back to the item's raw snmp_oid.
 */
export function metricForItemKey(key: string, m: HostMetrics): number | null | undefined {
  switch (key) {
    case 'system.cpu.util': return m.cpuUtil
    // Prefer the portable HOST-RESOURCES reading (works on Windows too); fall
    // back to the Linux-only UCD-SNMP reading if the host didn't expose it.
    case 'vm.memory.util': return m.memUtilPortable ?? m.memUtil
    case 'system.swap.util': return m.swapUtil
    case 'vfs.fs.size[/]': return m.rootFsUtil
    case 'vfs.fs.size[/,pfree]': return m.rootFsUtil == null ? null : Math.round((100 - m.rootFsUtil) * 10) / 10
    case 'system.cpu.load': return m.load1
    case 'system.cpu.load5': return m.load5
    case 'system.cpu.load15': return m.load15
    case 'proc.num': return m.processCount
    case 'system.uptime': return m.uptimeTicks == null ? null : Math.floor(m.uptimeTicks / 100)
    default: return undefined
  }
}

/** Evaluate a trigger's threshold condition. */
export function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold
    case '<': return value < threshold
    case '>=': return value >= threshold
    case '<=': return value <= threshold
    case '=': return value === threshold
    case '!=': return value !== threshold
    default: return false
  }
}

/** Whether a host is currently covered by an active maintenance window (by id
 *  or by group membership) — used to suppress new problems while it's up. */
export async function isHostUnderMaintenance(hostId: string): Promise<boolean> {
  const db = getDb()
  const nowIso = new Date().toISOString()
  const { rows } = await db.query(
    `SELECT host_ids, group_ids FROM server_maintenance WHERE active_since <= $1 AND active_till >= $1`,
    [nowIso]
  )
  if (!rows.length) return false
  const { rows: grpRows } = await db.query('SELECT group_id FROM server_host_group_members WHERE host_id = $1', [hostId])
  const hostGroups = new Set(grpRows.map((r) => r.group_id))
  for (const m of rows) {
    const hostIds = safeArr(m.host_ids)
    const groupIds = safeArr(m.group_ids)
    if (hostIds.includes(hostId)) return true
    if (groupIds.some((g) => hostGroups.has(g))) return true
  }
  return false
}

function safeArr(v: any): string[] {
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

/** Fire every enabled Action whose min_severity is met by a new (non-suppressed)
 *  problem, notifying its linked alert channel. Shared by the trigger-based
 *  poller and the SNMP trap receiver — both open server_problems rows, just
 *  from different sources. */
export async function fireServerActions(hostName: string, problemName: string, severity: number): Promise<void> {
  const db = getDb()
  const { rows: actions } = await db.query(`SELECT * FROM server_actions WHERE status = 'enabled' AND min_severity <= $1 AND channel_id IS NOT NULL`, [severity])
  if (!actions.length) return
  const msg = `🔴 PROBLEM (sev ${severity}) — ${hostName}: ${problemName}`
  for (const a of actions) {
    try {
      const ch = await db.query('SELECT type, config FROM alert_channels WHERE id = $1 AND enabled = true', [a.channel_id])
      if (!ch.rows.length) continue
      const config = typeof ch.rows[0].config === 'string' ? JSON.parse(ch.rows[0].config || '{}') : (ch.rows[0].config || {})
      await notifyChannel({ type: ch.rows[0].type, config }, msg)
    } catch (e: any) {
      console.error('[serverMonitor] action notify failed:', e?.message || e)
    }
  }
}
