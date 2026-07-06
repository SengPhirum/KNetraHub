import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import {
  pingHost,
  snmpGetSystem,
  snmpGetInterfaces,
  uptimeFromTicks,
  formatRate,
  rateBps,
  mapLimit,
  type SnmpOpts
} from '~~/layers/monitoring/server/utils/netMonitor'
import { recordNetSample, recordSensorReadings } from '~~/server/utils/metrics'

/**
 * Real Network poller. On each cycle it ICMP-pings every device, and for SNMP
 * devices that respond it reads system info + the interface table, derives
 * per-interface bit-rates from counter deltas, records an ICMP-latency sensor,
 * and raises/clears a "device down" alert on status transitions. There is no
 * simulated data. Disable with NUXT_NET_POLLING_ENABLED=false.
 */
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  const cfg = useRuntimeConfig().net as NetConfig
  if (!cfg?.pollingEnabled) {
    console.log('[netPoller] disabled (set NUXT_NET_POLLING_ENABLED=true to enable real polling)')
    return
  }

  const intervalMs = Math.max(15, Number(cfg.pollIntervalSeconds) || 60) * 1000
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      await pollAllDevices(cfg)
    } catch (err) {
      console.error('[netPoller] cycle error:', err)
    } finally {
      running = false
    }
  }

  setTimeout(tick, 8000) // let the DB warm up first
  setInterval(tick, intervalMs)
})

interface NetConfig {
  pollingEnabled: boolean
  pollIntervalSeconds: number
  pollConcurrency: number
  snmpCommunity: string
  snmpVersion: string
  snmpTimeoutMs: number
  pingTimeoutSeconds: number
}

async function pollAllDevices(cfg: NetConfig) {
  const db = getDb()
  // Paused devices (monitoring_enabled = false) are intentionally offline; skip
  // them so the poller doesn't overwrite their "paused" status or raise alerts.
  const { rows: devices } = await db.query('SELECT * FROM net_devices WHERE monitoring_enabled IS NOT FALSE')
  if (!devices.length) return
  const concurrency = Math.max(1, Number(cfg.pollConcurrency) || 16)
  await mapLimit(devices, concurrency, (d) => pollDevice(d, cfg).catch((e) => {
    console.error(`[netPoller] ${d.ip} failed:`, e?.message || e)
  }))
}

async function pollDevice(device: any, cfg: NetConfig) {
  const db = getDb()
  const now = new Date().toISOString()
  const result = await pingHost(device.ip, Number(cfg.pingTimeoutSeconds) || 2)
  const newStatus = result.alive ? 'up' : 'down'

  let { uptime, sys_name, sys_descr, sys_object_id, vendor, os } = device

  if (result.alive && device.poll_method === 'snmp') {
    const opts: SnmpOpts = {
      community: device.snmp_community || cfg.snmpCommunity,
      version: device.snmp_version || cfg.snmpVersion,
      timeoutMs: cfg.snmpTimeoutMs,
      // SNMPv3 credentials (only used when version === 'v3').
      secLevel: device.snmp_sec_level || undefined,
      authUser: device.snmp_auth_user || undefined,
      authProtocol: device.snmp_auth_protocol || undefined,
      authPassword: device.snmp_auth_password || undefined,
      privProtocol: device.snmp_priv_protocol || undefined,
      privPassword: device.snmp_priv_password || undefined
    }
    const sys = await snmpGetSystem(device.ip, opts)
    if (sys) {
      uptime = uptimeFromTicks(sys.sysUpTimeTicks)
      if (sys.sysName) sys_name = sys.sysName
      if (sys.sysDescr) sys_descr = sys.sysDescr
      if (sys.sysObjectID) sys_object_id = sys.sysObjectID
      if (sys.vendor) vendor = sys.vendor
      if ((!os || os === 'Unknown') && sys.sysDescr) os = sys.sysDescr.split(/[,;]/)[0].slice(0, 100)
      await upsertInterfaces(device.id, device.ip, opts)
    }
  }

  await db.query(
    `UPDATE net_devices
       SET status = $1, uptime = $2, sys_name = $3, sys_descr = $4, sys_object_id = $5,
           vendor = $6, os = $7, last_polled = $8, last_rtt_ms = $9
     WHERE id = $10`,
    [newStatus, uptime, sys_name, sys_descr, sys_object_id, vendor, os, now, result.rttMs, device.id]
  )

  const pingSensorId = await upsertPingSensor(device.id, result.rttMs)
  if (pingSensorId) await recordSensorReadings(pingSensorId, [{ channel: 'value', value: result.rttMs }])

  // Time-series history for the /net dashboard latency + availability graphs.
  await recordNetSample(device.id, result.rttMs, result.alive ? 1 : 0)

  if (device.status && device.status !== newStatus) {
    await handleStatusChange(device, newStatus, now)
  }
}

async function upsertInterfaces(deviceId: string, ip: string, opts: SnmpOpts) {
  const db = getDb()
  const ifaces = await snmpGetInterfaces(ip, opts)
  if (!ifaces.length) return
  const now = new Date().toISOString()

  const { rows } = await db.query(
    'SELECT id, name, last_in_octets, last_out_octets, last_poll_at FROM net_interfaces WHERE device_id = $1',
    [deviceId]
  )
  const existing = new Map<string, any>(rows.map((r) => [r.name, r]))

  for (const i of ifaces) {
    const prev = existing.get(i.name)
    const seconds = prev?.last_poll_at ? (Date.parse(now) - Date.parse(prev.last_poll_at)) / 1000 : 0
    let inTraffic = '0 Mbps'
    let outTraffic = '0 Mbps'
    if (seconds > 0) {
      inTraffic = formatRate(prev.last_in_octets, i.inOctets, seconds)
      outTraffic = formatRate(prev.last_out_octets, i.outOctets, seconds)
    }

    if (prev) {
      await db.query(
        `UPDATE net_interfaces
           SET status=$1, speed=$2, in_traffic=$3, out_traffic=$4, mac_address=$5, mtu=$6,
               admin_status=$7, oper_status=$8, type=$9, if_index=$10,
               last_in_octets=$11, last_out_octets=$12, last_poll_at=$13
         WHERE id=$14`,
        [i.operStatus, i.speed, inTraffic, outTraffic, i.mac, i.mtu, i.adminStatus, i.operStatus,
          i.type, i.ifIndex, i.inOctets, i.outOctets, now, prev.id]
      )
    } else {
      await db.query(
        `INSERT INTO net_interfaces
          (id, device_id, name, status, speed, in_traffic, out_traffic, mac_address, mtu,
           admin_status, oper_status, type, if_index, last_in_octets, last_out_octets, last_poll_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [nanoid(), deviceId, i.name, i.operStatus, i.speed, inTraffic, outTraffic, i.mac, i.mtu,
          i.adminStatus, i.operStatus, i.type, i.ifIndex, i.inOctets, i.outOctets, now]
      )
    }

    // Interface-bandwidth sensor (PRTG-style) with In/Out channels. Only for
    // operationally-up, non-loopback interfaces, and only once we have a prior
    // counter read to derive a real rate from (the first cycle just seeds it).
    if (seconds > 0 && i.operStatus === 'up' && i.type !== 'loopback') {
      const inMbps = toMbps(rateBps(prev.last_in_octets, i.inOctets, seconds))
      const outMbps = toMbps(rateBps(prev.last_out_octets, i.outOctets, seconds))
      if (inMbps != null || outMbps != null) {
        const total = Math.round((inMbps || 0) + (outMbps || 0))
        const sensorId = await upsertTrafficSensor(deviceId, i.name, total, speedToMbps(i.speed))
        await recordSensorReadings(sensorId, [
          { channel: 'in', value: inMbps },
          { channel: 'out', value: outMbps }
        ])
      }
    }
  }
}

/** bits-per-second -> Mbps rounded to 2dp, preserving null. */
function toMbps(bps: number | null): number | null {
  return bps == null ? null : Math.round((bps / 1e6) * 100) / 100
}

/** Parse an interface speed string (e.g. "1Gbps", "100Mbps") to numeric Mbps. */
function speedToMbps(speed: string): number | null {
  const m = /^([\d.]+)\s*(gbps|mbps|kbps)$/i.exec((speed || '').trim())
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const unit = m[2]!.toLowerCase()
  if (unit === 'gbps') return n * 1000
  if (unit === 'kbps') return n / 1000
  return n
}

/** Upsert the per-interface bandwidth sensor (matched by device + type + name),
 *  keeping its current total throughput and line-rate limit fresh. */
async function upsertTrafficSensor(deviceId: string, ifName: string, totalMbps: number, limitHighMbps: number | null): Promise<string> {
  const db = getDb()
  const name = `IF ${ifName}`
  const existing = await db.query(
    `SELECT id FROM net_sensors WHERE device_id = $1 AND sensor_type = 'traffic' AND name = $2 LIMIT 1`,
    [deviceId, name]
  )
  if (existing.rows.length) {
    const id = existing.rows[0].id
    await db.query('UPDATE net_sensors SET current_value = $1, limit_high = $2 WHERE id = $3', [totalMbps, limitHighMbps, id])
    return id
  }
  const id = nanoid()
  await db.query(
    `INSERT INTO net_sensors (id, device_id, sensor_type, name, current_value, unit, limit_high, limit_low)
     VALUES ($1, $2, 'traffic', $3, $4, 'Mbps', $5, 0)`,
    [id, deviceId, name, totalMbps, limitHighMbps]
  )
  return id
}

async function upsertPingSensor(deviceId: string, rttMs: number | null): Promise<string | null> {
  if (rttMs == null) return null
  const db = getDb()
  const existing = await db.query(
    `SELECT id FROM net_sensors WHERE device_id = $1 AND sensor_type = 'ping' LIMIT 1`,
    [deviceId]
  )
  if (existing.rows.length) {
    const id = existing.rows[0].id
    await db.query('UPDATE net_sensors SET current_value = $1 WHERE id = $2', [rttMs, id])
    return id
  }
  const id = nanoid()
  await db.query(
    `INSERT INTO net_sensors (id, device_id, sensor_type, name, current_value, unit, limit_high, limit_low)
     VALUES ($1, $2, 'ping', 'ICMP Latency', $3, 'ms', 200, 0)`,
    [id, deviceId, rttMs]
  )
  return id
}

async function handleStatusChange(device: any, newStatus: string, now: string) {
  const db = getDb()
  if (newStatus === 'down') {
    const open = await db.query(
      `SELECT id FROM net_alerts WHERE device_id = $1 AND status = 'active' AND message LIKE 'Device down%' LIMIT 1`,
      [device.id]
    )
    if (!open.rows.length) {
      await db.query(
        `INSERT INTO net_alerts (id, device_id, rule_id, message, severity, status, timestamp)
         VALUES ($1, $2, NULL, $3, 'critical', 'active', $4)`,
        [nanoid(), device.id, `Device down: ${device.hostname} (${device.ip}) is not responding to ICMP`, now]
      )
    }
  } else if (newStatus === 'up') {
    await db.query(
      `UPDATE net_alerts SET status = 'recovered' WHERE device_id = $1 AND status = 'active' AND message LIKE 'Device down%'`,
      [device.id]
    )
  }
}
