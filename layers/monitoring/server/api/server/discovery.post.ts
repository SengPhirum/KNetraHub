import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { cidrHosts, pingHost, snmpGetSystem, mapLimit } from '~~/layers/monitoring/server/utils/netMonitor'

// Real discovery sweep: ping every address in a CIDR (≤1024), optionally read
// SNMP sysName/description, and create a server_host for each responder not
// already known. Records a job row. Mirrors the Network module's discovery.
export default defineEventHandler(async (event) => {
  const b = await readBody<{ cidr?: string; method?: string; community?: string }>(event)
  const cidr = (b.cidr || '').trim()
  const method = b.method === 'icmp+snmp' ? 'icmp+snmp' : 'icmp'
  const { hosts, error } = cidrHosts(cidr, 1024)
  if (error) throw createError({ statusCode: 400, statusMessage: error })

  const cfg = useRuntimeConfig().server as any
  const db = getDb()
  const jobId = nanoid()
  const startedAt = new Date().toISOString()

  const { rows: existing } = await db.query('SELECT ip FROM server_hosts')
  const known = new Set(existing.map((r) => r.ip))

  let found = 0, added = 0
  const concurrency = Math.max(1, Number(cfg?.discoveryConcurrency) || 64)
  await mapLimit(hosts, concurrency, async (ip) => {
    const ping = await pingHost(ip, Number(cfg?.pingTimeoutSeconds) || 2)
    if (!ping.alive) return
    found++
    if (known.has(ip)) return
    let name = ip, os: string | null = null, sysName: string | null = null, sysDescr: string | null = null
    let pollMethod = 'icmp'
    if (method === 'icmp+snmp') {
      const sys = await snmpGetSystem(ip, { community: b.community || cfg?.snmpCommunity || 'public', version: cfg?.snmpVersion || 'v2c', timeoutMs: cfg?.snmpTimeoutMs || 2000 }).catch(() => null)
      if (sys?.sysName) { name = sys.sysName; sysName = sys.sysName; pollMethod = 'snmp' }
      if (sys?.sysDescr) { sysDescr = sys.sysDescr; os = sys.sysDescr.split(/[,;]/)[0].slice(0, 100) }
    }
    known.add(ip)
    await db.query(
      `INSERT INTO server_hosts (id, name, ip, os, status, availability, monitoring_enabled, poll_method, snmp_community, sys_name, sys_descr, created_at)
       VALUES ($1,$2,$3,$4,'Available','available',true,$5,$6,$7,$8,$9)`,
      [nanoid(), name.slice(0, 120), ip, os, pollMethod, method === 'icmp+snmp' ? (b.community || cfg?.snmpCommunity || 'public') : null, sysName, sysDescr, new Date().toISOString()]
    )
    added++
  })

  await db.query(
    `INSERT INTO server_discovery_jobs (id, cidr, method, status, scanned, found, added, started_at, finished_at)
     VALUES ($1,$2,$3,'completed',$4,$5,$6,$7,$8)`,
    [jobId, cidr, method, hosts.length, found, added, startedAt, new Date().toISOString()]
  )
  return { scanned: hosts.length, found, added }
})
