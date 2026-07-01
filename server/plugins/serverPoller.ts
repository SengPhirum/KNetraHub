import { getDb } from '../utils/db'
import { nanoid } from 'nanoid'
import {
  pingHost,
  snmpGetSystem,
  snmpGetHostMetrics,
  snmpGetNumeric,
  uptimeFromTicks,
  mapLimit,
  type SnmpOpts,
  type HostMetrics
} from '../utils/netMonitor'
import { recordServerItemSample } from '../utils/metrics'
import { metricForItemKey, evaluateCondition } from '../utils/serverMonitor'
import { notifyChannel } from '../utils/alertNotify'

/**
 * Real Server poller (Zabbix engine). On each cycle it ICMP-pings every enabled
 * host, collects its SNMP items (CPU/memory/disk/uptime/load or a custom OID),
 * writes item history, and evaluates each trigger into a Problem — respecting
 * maintenance suppression and firing matching Actions. No simulated data.
 * Disable with NUXT_SERVER_POLLING_ENABLED=false.
 */
export default defineNitroPlugin(() => {
  const cfg = useRuntimeConfig().server as ServerConfig
  if (!cfg?.pollingEnabled) {
    console.log('[serverPoller] disabled (set NUXT_SERVER_POLLING_ENABLED=true to enable)')
    return
  }
  const intervalMs = Math.max(15, Number(cfg.pollIntervalSeconds) || 60) * 1000
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await pollAll(cfg) } catch (e) { console.error('[serverPoller] cycle error:', e) } finally { running = false }
  }
  setTimeout(tick, 10000) // let the DB warm up
  setInterval(tick, intervalMs)
})

interface ServerConfig {
  pollingEnabled: boolean
  pollIntervalSeconds: number
  pollConcurrency: number
  snmpCommunity: string
  snmpVersion: string
  snmpTimeoutMs: number
  pingTimeoutSeconds: number
}

async function pollAll(cfg: ServerConfig) {
  const db = getDb()
  const { rows: hosts } = await db.query(`SELECT * FROM server_hosts WHERE monitoring_enabled IS NOT FALSE`)
  const concurrency = Math.max(1, Number(cfg.pollConcurrency) || 16)
  if (hosts.length) {
    await mapLimit(hosts, concurrency, (h) => pollHost(h, cfg).catch((e) => console.error(`[serverPoller] ${h.ip} failed:`, e?.message || e)))
  }
  await pollWebScenarios(cfg).catch((e) => console.error('[serverPoller] web checks failed:', e?.message || e))
}

// Run each enabled web scenario's ordered steps (Zabbix multi-step web check).
// The scenario is up only if every step passes its expected status + optional
// required string; aggregate latency is the sum of step times.
async function pollWebScenarios(cfg: ServerConfig) {
  const db = getDb()
  const { rows } = await db.query(`SELECT * FROM server_web_scenarios WHERE status = 'enabled'`)
  if (!rows.length) return
  const timeout = Number((cfg as any).webTimeoutMs) || 8000
  await mapLimit(rows, 8, async (w: any) => {
    const now = new Date().toISOString()
    let steps = (await db.query('SELECT * FROM server_web_steps WHERE scenario_id = $1 ORDER BY step_no ASC', [w.id])).rows
    if (!steps.length) steps = [{ id: null, url: w.url, expected_status: w.expected_status, required_string: null }]

    let allUp = true, totalMs = 0, lastCode: number | null = null
    for (const s of steps) {
      const r = await runStep(s.url, s.expected_status || 200, s.required_string, timeout)
      allUp = allUp && r.up
      totalMs += r.ms
      lastCode = r.code
      if (s.id) {
        await db.query('UPDATE server_web_steps SET last_status = $1, last_code = $2, last_ms = $3, last_check = $4 WHERE id = $5',
          [r.up ? 'up' : 'down', r.code, r.ms, now, s.id])
      }
      if (!r.up) break // stop at the first failing step, like Zabbix
    }
    await db.query('UPDATE server_web_scenarios SET last_status = $1, last_code = $2, last_ms = $3, last_check = $4 WHERE id = $5',
      [allUp ? 'up' : 'down', lastCode, totalMs, now, w.id])
  })
}

async function runStep(url: string, expected: number, requiredString: string | null, timeout: number): Promise<{ up: boolean; code: number | null; ms: number }> {
  const started = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeout)
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'follow' })
    let up = res.status === expected
    if (up && requiredString) { const body = await res.text().catch(() => ''); up = body.includes(requiredString) }
    clearTimeout(t)
    return { up, code: res.status, ms: Date.now() - started }
  } catch {
    return { up: false, code: null, ms: Date.now() - started }
  }
}

async function pollHost(host: any, cfg: ServerConfig) {
  const db = getDb()
  const now = new Date().toISOString()

  const ping = host.poll_method === 'none'
    ? { alive: true, rttMs: null }
    : await pingHost(host.ip, Number(cfg.pingTimeoutSeconds) || 2)
  const availability = host.poll_method === 'none' ? 'unknown' : (ping.alive ? 'available' : 'unavailable')

  // Built-in ICMP items (every host).
  const icmpUp = await ensureItem(host.id, 'icmpping', 'ICMP ping', '', 'icmp')
  await setItemValue(icmpUp, ping.alive ? 1 : 0, now)
  if (ping.rttMs != null) {
    const rtt = await ensureItem(host.id, 'icmp.responsetime', 'ICMP response time', 'ms', 'icmp')
    await setItemValue(rtt, ping.rttMs, now)
  }

  let sysName = host.sys_name
  let sysDescr = host.sys_descr
  let uptime = host.uptime

  if (ping.alive && host.poll_method === 'snmp') {
    const opts = snmpOpts(host, cfg)
    const [sys, metrics] = await Promise.all([snmpGetSystem(host.ip, opts).catch(() => null), snmpGetHostMetrics(host.ip, opts).catch(() => null)])
    if (sys) {
      if (sys.sysName) sysName = sys.sysName
      if (sys.sysDescr) sysDescr = sys.sysDescr
      uptime = uptimeFromTicks(sys.sysUpTimeTicks)
    }
    await collectSnmpItems(host, opts, metrics, now)
  }

  await db.query(
    `UPDATE server_hosts SET availability = $1, status = $2, last_polled = $3, last_rtt_ms = $4,
       sys_name = $5, sys_descr = $6, uptime = $7 WHERE id = $8`,
    [availability, availability === 'available' ? 'Available' : availability === 'unavailable' ? 'Offline' : 'Unknown',
      now, ping.rttMs, sysName, sysDescr, uptime, host.id]
  )

  await evaluateTriggers(host, now)
}

function snmpOpts(host: any, cfg: ServerConfig): SnmpOpts {
  return {
    community: host.snmp_community || cfg.snmpCommunity,
    version: host.snmp_version || cfg.snmpVersion,
    timeoutMs: cfg.snmpTimeoutMs,
    secLevel: host.snmp_sec_level || undefined,
    authUser: host.snmp_auth_user || undefined,
    authProtocol: host.snmp_auth_protocol || undefined,
    authPassword: host.snmp_auth_password || undefined,
    privProtocol: host.snmp_priv_protocol || undefined,
    privPassword: host.snmp_priv_password || undefined
  }
}

// Resolve + record each enabled SNMP item's value (known key metric, else raw OID).
async function collectSnmpItems(host: any, opts: SnmpOpts, metrics: HostMetrics | null, now: string) {
  const db = getDb()
  const { rows: items } = await db.query(`SELECT * FROM server_items WHERE host_id = $1 AND status = 'enabled' AND type = 'snmp'`, [host.id])
  for (const item of items) {
    let value: number | null | undefined
    if (metrics) value = metricForItemKey(item.key_, metrics)
    if (value === undefined) value = item.snmp_oid ? await snmpGetNumeric(host.ip, opts, item.snmp_oid) : null
    if (value != null) await setItemValue(item.id, value, now)
  }
}

async function ensureItem(hostId: string, key: string, name: string, units: string, type: string): Promise<string> {
  const db = getDb()
  const found = await db.query('SELECT id FROM server_items WHERE host_id = $1 AND key_ = $2 LIMIT 1', [hostId, key])
  if (found.rows.length) return found.rows[0].id
  const id = nanoid()
  await db.query(
    `INSERT INTO server_items (id, host_id, name, key_, type, value_type, units, update_interval, status, created_at)
     VALUES ($1,$2,$3,$4,$5,'numeric',$6,60,'enabled',$7)`,
    [id, hostId, name, key, type, units || null, new Date().toISOString()]
  )
  return id
}

async function setItemValue(itemId: string, value: number, clock: string) {
  const db = getDb()
  await db.query('UPDATE server_items SET last_value = $1, last_clock = $2 WHERE id = $3', [value, clock, itemId])
  await recordServerItemSample(itemId, value)
}

// ── Trigger evaluation → problems ────────────────────────────────────────────
async function evaluateTriggers(host: any, now: string) {
  const db = getDb()
  const { rows: triggers } = await db.query(
    `SELECT tr.*, i.last_value FROM server_triggers tr JOIN server_items i ON i.id = tr.item_id
     WHERE tr.host_id = $1 AND tr.status = 'enabled'`,
    [host.id]
  )
  for (const tr of triggers) {
    if (tr.last_value == null) continue
    const breached = evaluateCondition(Number(tr.last_value), tr.operator, Number(tr.threshold))
    const forMs = (Number(tr.for_seconds) || 0) * 1000

    if (breached) {
      if (tr.last_state === 'problem') continue
      // Sustained-for window: remember when the breach started.
      if (forMs > 0) {
        if (!tr.since) { await db.query('UPDATE server_triggers SET since = $1 WHERE id = $2', [now, tr.id]); continue }
        if (Date.now() - Date.parse(tr.since) < forMs) continue
      }
      await openProblem(host, tr, now)
      await db.query(`UPDATE server_triggers SET last_state = 'problem', since = NULL WHERE id = $1`, [tr.id])
    } else {
      if (tr.since) await db.query('UPDATE server_triggers SET since = NULL WHERE id = $1', [tr.id])
      if (tr.last_state === 'problem') {
        await db.query(`UPDATE server_problems SET status = 'resolved', r_clock = $1 WHERE trigger_id = $2 AND status = 'problem'`, [now, tr.id])
        await db.query(`UPDATE server_triggers SET last_state = 'ok' WHERE id = $1`, [tr.id])
      }
    }
  }
}

async function openProblem(host: any, tr: any, now: string) {
  const db = getDb()
  // Don't double-open.
  const open = await db.query(`SELECT id FROM server_problems WHERE trigger_id = $1 AND status = 'problem' LIMIT 1`, [tr.id])
  if (open.rows.length) return

  const suppressed = await isHostUnderMaintenance(host.id)
  await db.query(
    `INSERT INTO server_problems (id, host_id, trigger_id, trigger, name, severity_num, fired_at, status, ack, suppressed)
     VALUES ($1,$2,$3,$4,$4,$5,$6,'problem',false,$7)`,
    [nanoid(), host.id, tr.id, tr.name, Number(tr.severity) || 0, now, suppressed]
  )
  if (!suppressed) await fireActions(host, tr)
}

async function isHostUnderMaintenance(hostId: string): Promise<boolean> {
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
    const hostIds: string[] = safeArr(m.host_ids)
    const groupIds: string[] = safeArr(m.group_ids)
    if (hostIds.includes(hostId)) return true
    if (groupIds.some((g) => hostGroups.has(g))) return true
  }
  return false
}

function safeArr(v: any): string[] {
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

async function fireActions(host: any, tr: any) {
  const db = getDb()
  const sev = Number(tr.severity) || 0
  const { rows: actions } = await db.query(`SELECT * FROM server_actions WHERE status = 'enabled' AND min_severity <= $1 AND channel_id IS NOT NULL`, [sev])
  if (!actions.length) return
  const msg = `🔴 PROBLEM (sev ${sev}) — ${host.name}: ${tr.name}`
  for (const a of actions) {
    try {
      const ch = await db.query('SELECT type, config FROM alert_channels WHERE id = $1 AND enabled = true', [a.channel_id])
      if (!ch.rows.length) continue
      const config = typeof ch.rows[0].config === 'string' ? JSON.parse(ch.rows[0].config || '{}') : (ch.rows[0].config || {})
      await notifyChannel({ type: ch.rows[0].type, config }, msg)
    } catch (e: any) {
      console.error('[serverPoller] action notify failed:', e?.message || e)
    }
  }
}
