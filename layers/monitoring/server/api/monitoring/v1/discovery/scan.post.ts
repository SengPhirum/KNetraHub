import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { enqueue } from '../../../../jobs/queue'

/**
 * POST /api/monitoring/v1/discovery/scan — bulk-add devices from a CIDR
 * (operator tier). Safety: CIDR is bounded to /20 (≤4094 hosts); the actual
 * ICMP/SNMP sweep runs as background discovery jobs so the request returns
 * immediately with the candidate host list.
 *
 * This endpoint only creates device rows for hosts the caller authorises via
 * the CIDR; each new device is queued for full discovery which performs the
 * real reachability + credential check. Allowed/excluded lists are honoured.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const body = await readBody(event)

  const cidr = String(body?.cidr ?? '').trim()
  const m = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) badRequest('cidr must be an IPv4 CIDR like 10.0.0.0/24')
  const prefix = Number(m[2])
  if (prefix < 20 || prefix > 32) badRequest('prefix must be between /20 and /32 (max 4094 hosts per scan)')

  const profileId = body?.credential_profile_id ? Number(body.credential_profile_id) : null
  const pollerGroup = Number(body?.poller_group ?? 0)
  const excluded: string[] = Array.isArray(body?.exclude) ? body.exclude.map(String) : []

  const hosts = enumerateHosts(m[1], prefix).filter((h) => !excluded.includes(h))
  let created = 0
  const skipped: string[] = []
  for (const host of hosts) {
    const exists = await db.query(`SELECT 1 FROM monitoring.devices WHERE ip = $1::inet OR hostname = $1`, [host])
    if (exists.rows.length) {
      skipped.push(host)
      continue
    }
    const res = await db.query(
      `INSERT INTO monitoring.devices (hostname, ip, credential_profile_id, poller_group, status)
       VALUES ($1,$1::inet,$2,$3,'pending') RETURNING id`,
      [host, profileId, pollerGroup]
    )
    await enqueue(db, { type: 'discovery', deviceId: Number(res.rows[0].id), dedupeKey: `discovery:${res.rows[0].id}`, priority: 30 })
    created++
  }

  await auditMonitoring(user.username, 'discovery.scan', cidr, `created=${created} skipped=${skipped.length}`)
  return { cidr, candidates: hosts.length, created, skipped: skipped.length, queued_discovery: created }
})

function enumerateHosts(baseIp: string, prefix: number): string[] {
  const base = baseIp.split('.').map(Number)
  const baseInt = ((base[0]! << 24) | (base[1]! << 16) | (base[2]! << 8) | base[3]!) >>> 0
  const hostBits = 32 - prefix
  const size = hostBits >= 31 ? (1 << hostBits) : (1 << hostBits)
  const network = baseInt & (~((size - 1) >>> 0) >>> 0)
  const out: string[] = []
  const first = prefix >= 31 ? 0 : 1
  const last = prefix >= 31 ? size - 1 : size - 2
  for (let i = first; i <= last; i++) {
    const ip = (network + i) >>> 0
    out.push([(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.'))
  }
  return out
}
