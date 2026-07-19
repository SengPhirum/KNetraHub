import ping from 'ping'
import { getMonitoringDb as getDb } from '~~/server/utils/moduleDb'
import { parseIPv4Cidr, enumerateIPv4Hosts } from '../utils/cidr'

/**
 * Runs a CIDR reachability sweep (ICMP only — cheap and safe to run against
 * a whole subnet) and records one candidate row per host. This never touches
 * monitoring.devices; an operator reviews the candidates and explicitly
 * imports the ones they want via /discovery/scans/:id/import.
 */
const CONCURRENCY = 40
const CHUNK = 500

export async function runDiscoveryScan(scanId: number): Promise<void> {
  const db = getDb()
  const scanRes = await db.query(`SELECT * FROM monitoring.discovery_scans WHERE id = $1`, [scanId])
  const scan = scanRes.rows[0]
  if (!scan) throw new Error(`discovery scan ${scanId} not found`)

  try {
    const parsed = parseIPv4Cidr(scan.cidr)
    if (!parsed) throw new Error(`stored cidr "${scan.cidr}" is invalid`)
    const excluded: string[] = Array.isArray(scan.exclude) ? scan.exclude : []
    const hosts = enumerateIPv4Hosts(parsed.base, parsed.prefix).filter((h) => !excluded.includes(h))

    const existingRes = hosts.length
      ? await db.query(
          `SELECT id, host(ip) AS ip, hostname FROM monitoring.devices WHERE ip = ANY($1::inet[]) OR hostname = ANY($2::text[])`,
          [hosts, hosts]
        )
      : { rows: [] as any[] }
    const existingByHost = new Map<string, number>()
    for (const row of existingRes.rows) {
      if (row.ip) existingByHost.set(row.ip, Number(row.id))
      if (row.hostname) existingByHost.set(row.hostname, Number(row.id))
    }

    const rc = useRuntimeConfig().monitoring as Record<string, any>
    const timeoutSeconds = Number(rc.pingTimeoutSeconds ?? 2)

    let scanned = 0
    const results: { host: string; alive: boolean; rttMs: number | null; existingDeviceId: number | null }[] = new Array(hosts.length)
    let cursor = 0
    async function worker() {
      while (cursor < hosts.length) {
        const i = cursor++
        const host = hosts[i]!
        const existingDeviceId = existingByHost.get(host) ?? null
        let alive = false
        let rttMs: number | null = null
        if (existingDeviceId == null) {
          try {
            const res = await ping.promise.probe(host, { timeout: timeoutSeconds, min_reply: 1 })
            alive = !!res.alive
            rttMs = res.time === 'unknown' ? null : Number(res.time)
          } catch {
            alive = false
          }
        }
        results[i] = { host, alive, rttMs, existingDeviceId }
        scanned++
        if (scanned % 50 === 0) {
          await db.query(`UPDATE monitoring.discovery_scans SET scanned_hosts = $2 WHERE id = $1`, [scanId, scanned])
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker))

    let aliveCount = 0
    for (let i = 0; i < results.length; i += CHUNK) {
      const chunk = results.slice(i, i + CHUNK)
      const values: string[] = []
      const args: unknown[] = []
      for (const r of chunk) {
        if (r.alive) aliveCount++
        const base = args.length
        values.push(`($${base + 1},$${base + 2}::inet,$${base + 3},$${base + 4},$${base + 5},$${base + 6})`)
        args.push(scanId, r.host, r.alive, r.rttMs, r.existingDeviceId != null, r.existingDeviceId)
      }
      if (!values.length) continue
      await db.query(
        `INSERT INTO monitoring.discovery_candidates (scan_id, ip, alive, rtt_ms, already_exists, existing_device_id)
         VALUES ${values.join(',')}
         ON CONFLICT (scan_id, ip) DO UPDATE SET alive = EXCLUDED.alive, rtt_ms = EXCLUDED.rtt_ms,
           already_exists = EXCLUDED.already_exists, existing_device_id = EXCLUDED.existing_device_id`,
        args
      )
    }

    await db.query(
      `UPDATE monitoring.discovery_scans SET status = 'done', scanned_hosts = $2, alive_hosts = $3, finished_at = now() WHERE id = $1`,
      [scanId, hosts.length, aliveCount]
    )
  } catch (err: any) {
    await db.query(
      `UPDATE monitoring.discovery_scans SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
      [scanId, String(err?.message ?? err).slice(0, 2000)]
    )
    throw err
  }
}
