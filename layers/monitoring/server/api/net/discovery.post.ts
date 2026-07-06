import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import {
  cidrHosts,
  pingHost,
  snmpGetSystem,
  uptimeFromTicks,
  mapLimit,
  type SnmpOpts,
  type SnmpSystem
} from '~~/layers/monitoring/server/utils/netMonitor'

/**
 * Real auto-discovery. Expands the CIDR, runs an ICMP ping sweep and/or SNMP
 * probe across the range with bounded concurrency, then creates a device (and an
 * ICMP-latency sensor) for each newly found responder. Interfaces and ongoing
 * status are filled in by the background poller. Scope is capped per scan; scan
 * large networks one subnet (e.g. /24) at a time.
 *
 * Body: { cidr: "192.168.1.0/24", method: "ping" | "snmp" | "ping+snmp", community?: string }
 */
const MAX_HOSTS = 1024

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const cidr = String(body?.cidr || '').trim()
  const method = ['ping', 'snmp', 'ping+snmp'].includes(body?.method) ? body.method : 'ping+snmp'
  const cfg = useRuntimeConfig().net as any
  const db = getDb()
  const now = new Date().toISOString()

  const { hosts, error } = cidrHosts(cidr, MAX_HOSTS)
  if (error) throw createError({ statusCode: 400, statusMessage: error })

  const snmpOpts: SnmpOpts = {
    community: String(body?.community || cfg.snmpCommunity || 'public'),
    version: cfg.snmpVersion || 'v2c',
    timeoutMs: Number(cfg.snmpTimeoutMs) || 2000
  }
  const concurrency = Math.max(1, Number(cfg.discoveryConcurrency) || 64)
  const pingTimeout = 1 // seconds; LAN sweeps stay responsive

  const existing = new Set((await db.query('SELECT ip FROM net_devices')).rows.map((r) => r.ip))
  const localProbe = await db.query(`SELECT id FROM net_probes WHERE type = 'local' LIMIT 1`)
  const probeId: string | null = localProbe.rows[0]?.id ?? null

  // ── Reachability sweep ───────────────────────────────────────────────────
  let reachable: Array<{ ip: string; sys: SnmpSystem | null }> = []
  if (method === 'snmp') {
    const probed = await mapLimit(hosts, concurrency, async (ip) => ({ ip, sys: await snmpGetSystem(ip, snmpOpts) }))
    reachable = probed.filter((p) => p.sys)
  } else {
    const swept = await mapLimit(hosts, concurrency, async (ip) => ({ ip, alive: (await pingHost(ip, pingTimeout)).alive }))
    const aliveIps = swept.filter((s) => s.alive).map((s) => s.ip)
    if (method === 'ping') {
      reachable = aliveIps.map((ip) => ({ ip, sys: null }))
    } else {
      reachable = await mapLimit(aliveIps, Math.min(concurrency, 16), async (ip) => ({ ip, sys: await snmpGetSystem(ip, snmpOpts) }))
    }
  }

  const found = reachable.length
  let added = 0

  // ── Create new devices ───────────────────────────────────────────────────
  for (const { ip, sys } of reachable) {
    if (existing.has(ip)) continue
    const id = nanoid()
    const isSnmp = !!sys
    const hostname = sys?.sysName || `host-${ip.replace(/\./g, '-')}`
    const os = sys?.sysDescr ? sys.sysDescr.split(/[,;]/)[0].slice(0, 100) : 'Unknown'

    await db.query(
      `INSERT INTO net_devices
        (id, hostname, ip, type, vendor, os, status, uptime, snmp_version, snmp_community,
         poll_method, category, sys_name, sys_descr, sys_object_id, created_at, probe_id)
       VALUES ($1,$2,$3,$4,$5,$6,'up',$7,$8,$9,$10,'network',$11,$12,$13,$14,$15)`,
      [
        id, hostname, ip, deviceType(sys), sys?.vendor || 'Unknown', os,
        sys ? uptimeFromTicks(sys.sysUpTimeTicks) : '',
        isSnmp ? snmpOpts.version : null,
        isSnmp ? snmpOpts.community : null,
        isSnmp ? 'snmp' : 'ping',
        sys?.sysName || null, sys?.sysDescr || null, sys?.sysObjectID || null, now, probeId
      ]
    )

    const rtt = await pingHost(ip, pingTimeout)
    if (rtt.rttMs != null) {
      await db.query(
        `INSERT INTO net_sensors (id, device_id, sensor_type, name, current_value, unit, limit_high, limit_low)
         VALUES ($1, $2, 'ping', 'ICMP Latency', $3, 'ms', 200, 0)`,
        [nanoid(), id, rtt.rttMs]
      )
    }
    added++
  }

  const jobId = nanoid()
  await db.query(
    `INSERT INTO net_discovery_jobs (id, cidr, method, status, scanned, found, added, started_at, finished_at)
     VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8)`,
    [jobId, cidr, method, hosts.length, found, added, now, new Date().toISOString()]
  )

  return { id: jobId, cidr, method, status: 'completed', scanned: hosts.length, found, added }
})

function deviceType(sys: SnmpSystem | null): string {
  if (!sys) return 'Host'
  const d = (sys.sysDescr || '').toLowerCase()
  if (d.includes('router')) return 'Router'
  if (d.includes('switch')) return 'Switch'
  if (d.includes('firewall') || d.includes('pan-os') || d.includes('fortigate')) return 'Firewall'
  if (d.includes('access point') || d.includes('wireless')) return 'Access Point'
  if (d.includes('linux') || d.includes('windows') || d.includes('ubuntu')) return 'Server'
  if (d.includes('printer')) return 'Printer'
  return 'Device'
}
