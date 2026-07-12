import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import {
  pingHost,
  snmpGetSystem,
  snmpGetHostMetrics,
  snmpGetInterfaces,
  snmpGetEntitySensors,
  snmpGetNumeric,
  uptimeFromTicks,
  mapLimit,
  type SnmpOpts,
  type HostMetrics,
  type SnmpInterface
} from '~~/layers/monitoring/server/utils/netMonitor'
import { recordServerItemSample } from '~~/server/utils/metrics'
import { metricForItemKey, evaluateCondition, isHostUnderMaintenance, fireServerActions, fireServerRecovery } from '~~/layers/monitoring/server/utils/serverMonitor'
import { emitMonitoringEvent } from '~~/layers/monitoring/server/utils/monitoringEvents'
import { logSystem } from '~~/server/utils/moduleLogs'

/**
 * Real Server poller (Zabbix engine). On each cycle it ICMP-pings every enabled
 * host, collects its SNMP items (CPU/memory/disk/uptime/load or a custom OID),
 * writes item history, and evaluates each trigger into a Problem — respecting
 * maintenance suppression and firing matching Actions. No simulated data.
 * Disable with NUXT_SERVER_POLLING_ENABLED=false.
 */
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
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
    try { await pollAll(cfg) } catch (e: any) { await logSystem('monitoring', 'error', 'server.poll.failed', `Polling cycle failed: ${e?.message || e}`) } finally { running = false }
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
    await mapLimit(hosts, concurrency, (h) => pollHost(h, cfg).catch((e) =>
      logSystem('monitoring', 'debug', 'server.host.poll.failed', `${h.name || h.ip} (${h.ip}): ${e?.message || e}`)))
  }
  await pollWebScenarios(cfg).catch((e) => logSystem('monitoring', 'debug', 'server.web.poll.failed', String(e?.message || e)))
  emitMonitoringEvent('server')
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

    // Log only up<->down transitions, not every check.
    const newStatus = allUp ? 'up' : 'down'
    if (w.last_status && w.last_status !== newStatus) {
      if (allUp) await logSystem('monitoring', 'info', 'web.scenario.up', `Web check "${w.name || w.url}" passed again (${totalMs}ms)`)
      else await logSystem('monitoring', 'warning', 'web.scenario.down', `Web check "${w.name || w.url}" failed (HTTP ${lastCode ?? 'no response'})`)
    }
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
    const [sys, metrics, ifaces] = await Promise.all([
      snmpGetSystem(host.ip, opts).catch(() => null),
      snmpGetHostMetrics(host.ip, opts).catch(() => null),
      snmpGetInterfaces(host.ip, opts).catch(() => [] as SnmpInterface[])
    ])
    if (sys) {
      if (sys.sysName) sysName = sys.sysName
      if (sys.sysDescr) sysDescr = sys.sysDescr
      uptime = uptimeFromTicks(sys.sysUpTimeTicks)
    }
    await collectSnmpItems(host, opts, metrics, sys, ifaces, now)
  }

  await db.query(
    `UPDATE server_hosts SET availability = $1, status = $2, last_polled = $3, last_rtt_ms = $4,
       sys_name = $5, sys_descr = $6, uptime = $7 WHERE id = $8`,
    [availability, availability === 'available' ? 'Available' : availability === 'unavailable' ? 'Offline' : 'Unknown',
      now, ping.rttMs, sysName, sysDescr, uptime, host.id]
  )

  // Log only availability transitions, not every poll.
  if (host.availability && host.availability !== 'unknown' && host.availability !== availability) {
    if (availability === 'unavailable') {
      await logSystem('monitoring', 'warning', 'server.host.down', `Host "${host.name || host.ip}" (${host.ip}) became unavailable`)
    } else if (availability === 'available') {
      await logSystem('monitoring', 'info', 'server.host.up', `Host "${host.name || host.ip}" (${host.ip}) is available again`)
    }
  }

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

// Item keys resolved directly from the interface list (status/counters/uptime)
// rather than from HostMetrics or a raw OID get — handled as special cases in
// collectSnmpItems below, so they never reach metricForItemKey/snmpGetNumeric.
const INTERFACE_ITEM_KEYS = new Set([
  'net.if.in', 'net.if.out', 'net.if.in.packets', 'net.if.out.packets',
  'net.if.errors', 'net.if.discards', 'net.if.status', 'net.if.uptime', 'net.if.bandwidth.pct'
])

// Resolve + record each enabled SNMP item's value: a known host-metric key, an
// interface-derived key (status/counters on the primary NIC), a text item
// (sysDescr), or else a raw OID get.
async function collectSnmpItems(host: any, opts: SnmpOpts, metrics: HostMetrics | null, sys: { sysDescr?: string } | null, ifaces: SnmpInterface[], now: string) {
  const db = getDb()
  const { rows: items } = await db.query(`SELECT * FROM server_items WHERE host_id = $1 AND status = 'enabled' AND type = 'snmp'`, [host.id])
  if (!items.length) return
  const primaryIface = ifaces.find((i) => i.operStatus === 'up' && i.type !== 'loopback') || ifaces[0] || null

  // Entity-sensor (temperature/fan) walk is only issued when this host actually
  // has a linked item for one of these — most hosts don't and the walk would
  // just be wasted SNMP traffic.
  const needsEntitySensors = items.some((i) => i.key_ === 'sensor.temperature' || i.key_ === 'sensor.fan')
  const entitySensors = needsEntitySensors ? await snmpGetEntitySensors(host.ip, opts).catch(() => null) : null

  let inBps: number | null = null
  let outBps: number | null = null
  let bandwidthItem: any = null

  for (const item of items) {
    if (item.key_ === 'system.descr') {
      if (sys?.sysDescr) await setItemTextValue(item.id, sys.sysDescr, now)
      continue
    }
    if (item.key_ === 'sensor.temperature') {
      if (entitySensors?.temperatureC != null) await setItemValue(item.id, entitySensors.temperatureC, now)
      continue
    }
    if (item.key_ === 'sensor.fan') {
      if (entitySensors?.fanRpm != null) await setItemValue(item.id, entitySensors.fanRpm, now)
      continue
    }
    if (item.key_ === 'net.if.bandwidth.pct') { bandwidthItem = item; continue } // resolved after the loop
    if (INTERFACE_ITEM_KEYS.has(item.key_)) {
      switch (item.key_) {
        case 'net.if.in':
          inBps = await collectCounterItem(item, primaryIface?.inOctets ?? null, now, 8)
          break
        case 'net.if.out':
          outBps = await collectCounterItem(item, primaryIface?.outOctets ?? null, now, 8)
          break
        case 'net.if.in.packets':
          await collectCounterItem(item, primaryIface?.inUcastPkts ?? null, now, 1)
          break
        case 'net.if.out.packets':
          await collectCounterItem(item, primaryIface?.outUcastPkts ?? null, now, 1)
          break
        case 'net.if.errors':
          await collectCounterItem(item, sumOrNull(primaryIface?.inErrors, primaryIface?.outErrors), now, 1)
          break
        case 'net.if.discards':
          await collectCounterItem(item, sumOrNull(primaryIface?.inDiscards, primaryIface?.outDiscards), now, 1)
          break
        case 'net.if.status':
          if (primaryIface) await setItemValue(item.id, primaryIface.operStatus === 'up' ? 1 : 0, now)
          break
        case 'net.if.uptime':
          if (primaryIface?.lastChangeTicks != null) await setItemValue(item.id, Math.floor(primaryIface.lastChangeTicks / 100), now)
          break
      }
      continue
    }
    let value: number | null | undefined
    if (metrics) value = metricForItemKey(item.key_, metrics)
    if (value === undefined) value = item.snmp_oid ? await snmpGetNumeric(host.ip, opts, item.snmp_oid) : null
    if (value != null) await setItemValue(item.id, value, now)
  }

  // Bandwidth %: derived from the in/out rates just computed above plus the
  // interface's negotiated speed, not its own counter.
  if (bandwidthItem && primaryIface?.speedMbps && (inBps != null || outBps != null)) {
    const usedMbps = ((inBps || 0) + (outBps || 0)) / 1e6
    const pct = Math.max(0, Math.min(100, Math.round((usedMbps / primaryIface.speedMbps) * 1000) / 10))
    await setItemValue(bandwidthItem.id, pct, now)
  }
}

function sumOrNull(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null
  return (a || 0) + (b || 0)
}

// Counter-type item (e.g. interface octet/packet/error counters): derive a
// per-second rate from the delta against the item's previously stored raw
// reading, then stash the new raw reading for next cycle. `multiplier` is 8
// for byte counters (→ bits/sec) or 1 for plain per-second counts (packets,
// errors, discards). The first cycle just seeds the counter (no rate yet).
async function collectCounterItem(item: any, raw: number | null, now: string, multiplier: number): Promise<number | null> {
  if (raw == null) return null
  const db = getDb()
  let rate: number | null = null
  if (item.raw_counter != null && item.raw_counter_at) {
    const seconds = (Date.parse(now) - Date.parse(item.raw_counter_at)) / 1000
    if (seconds > 0) {
      const delta = raw - Number(item.raw_counter)
      if (delta >= 0) {
        rate = (delta * multiplier) / seconds
        await setItemValue(item.id, rate, now)
      }
    }
  }
  await db.query('UPDATE server_items SET raw_counter = $1, raw_counter_at = $2 WHERE id = $3', [raw, now, item.id])
  return rate
}

async function setItemTextValue(itemId: string, text: string, clock: string) {
  const db = getDb()
  await db.query('UPDATE server_items SET last_text = $1, last_clock = $2 WHERE id = $3', [text.slice(0, 500), clock, itemId])
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
        // Only notify recovery for problems that actually alerted (suppressed
        // ones opened silently under maintenance - they should close silently).
        const resolved = await db.query(
          `UPDATE server_problems SET status = 'resolved', r_clock = $1
           WHERE trigger_id = $2 AND status = 'problem' RETURNING suppressed`,
          [now, tr.id]
        )
        await db.query(`UPDATE server_triggers SET last_state = 'ok' WHERE id = $1`, [tr.id])
        await logSystem('monitoring', 'info', 'server.problem.resolved', `${host.name || host.ip}: "${tr.name}" resolved`)
        if (resolved.rows.some((r: any) => !r.suppressed)) {
          await fireServerRecovery(host.name || host.ip, tr.name, Number(tr.severity) || 0)
        }
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
  await logSystem('monitoring', 'warning', 'server.problem.opened',
    `${host.name || host.ip}: "${tr.name}" (severity ${Number(tr.severity) || 0})${suppressed ? ' - suppressed by maintenance' : ''}`)
  if (!suppressed) await fireServerActions(host.name, tr.name, Number(tr.severity) || 0)
}
