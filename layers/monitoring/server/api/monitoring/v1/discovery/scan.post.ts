import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { enqueue } from '../../../../jobs/queue'
import { parseIPv4Cidr, enumerateIPv4Hosts } from '../../../../utils/cidr'

/**
 * POST /api/monitoring/v1/discovery/scan — start a CIDR reachability sweep
 * (operator tier). This only pings hosts in the background and records
 * candidates; nothing is added to Devices until an operator reviews the
 * results and calls POST /discovery/scans/:id/import. Max /20 per scan
 * (≤4094 hosts).
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const body = await readBody(event)

  const cidr = String(body?.cidr ?? '').trim()
  const parsed = parseIPv4Cidr(cidr)
  if (!parsed) badRequest('cidr must be an IPv4 CIDR like 10.0.0.0/24')
  const prefix = parsed.prefix
  if (prefix < 20 || prefix > 32) badRequest('prefix must be between /20 and /32 (max 4094 hosts per scan)')

  const pollerGroup = Number(body?.poller_group ?? 0)
  const profileId = body?.credential_profile_id ? Number(body.credential_profile_id) : null
  const excluded: string[] = Array.isArray(body?.exclude) ? body.exclude.map(String) : []
  const hosts = enumerateIPv4Hosts(parsed.base, prefix).filter((h) => !excluded.includes(h))
  if (!hosts.length) badRequest('no hosts to scan after exclusions')

  const scanRes = await db.query(
    `INSERT INTO monitoring.discovery_scans (cidr, poller_group, credential_profile_id, exclude, requested_by, total_hosts)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [cidr, pollerGroup, profileId, JSON.stringify(excluded), user.username, hosts.length]
  )
  const scanId = Number(scanRes.rows[0].id)
  await enqueue(db, { type: 'discovery_scan', pollerGroup, payload: { scanId }, priority: 30, maxAttempts: 2 })
  await auditMonitoring(user.username, 'discovery.scan.start', cidr, `scan_id=${scanId} hosts=${hosts.length}`)

  return { scan_id: scanId, total_hosts: hosts.length }
})
