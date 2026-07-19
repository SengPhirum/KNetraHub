import ping from 'ping'
import { promises as dnsPromises } from 'node:dns'
import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { canonicalizeIp, enumerateHosts } from '~~/layers/ipmgt/server/utils/ipam'
import type { SubnetRow } from '~~/layers/ipmgt/server/utils/ipamStore'
import { logSystem } from '~~/server/utils/moduleLogs'

/**
 * ICMP reachability + subnet scan primitives for IPAM. A local port of
 * Monitoring's pingHost/mapLimit (layers/monitoring/server/utils/netMonitor.ts)
 * - kept separate rather than imported cross-layer. Wraps the system `ping`
 * binary (already a project dependency, already in the runtime image) via the
 * `ping` npm package; the target is always a validated, canonical IP passed as
 * a parameter, never shell-interpolated.
 */
export async function pingHost(ip: string, timeoutSec = 2): Promise<{ alive: boolean; rttMs: number | null }> {
  try {
    const res = await ping.promise.probe(ip, { timeout: timeoutSec, min_reply: 1 })
    const t = typeof res.time === 'number' ? res.time : Number(res.time)
    return { alive: !!res.alive, rttMs: Number.isFinite(t) ? Math.round(t) : null }
  } catch {
    return { alive: false, rttMs: null }
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker))
  return results
}

/** Reverse-DNS (PTR) lookup with a hard timeout; null when unresolvable. */
export async function resolveHostname(ip: string, timeoutMs = 2000): Promise<string | null> {
  try {
    const names = await Promise.race([
      dnsPromises.reverse(ip),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ])
    return names?.[0] || null
  } catch {
    return null
  }
}

export interface DiscoveredHost {
  ip: string
  hostname: string | null
  rttMs: number | null
}

export interface ScanReport {
  hostsScanned: number
  hostsUp: number
  newHosts: number
  /** Present in 'report' mode: alive-but-unknown hosts awaiting user confirmation. */
  discovered?: DiscoveredHost[]
}

/**
 * Scan one subnet: refresh last_seen/last_scanned on every existing address
 * (if ping_enabled), and - if scan_enabled - additionally probe not-yet-known
 * addresses in the subnet's usable range (capped, like the visual grid).
 * Responding unknown hosts get a reverse-DNS hostname lookup, then either:
 *  - discoverMode 'auto-add' (scheduled scans): recorded as new 'used' addresses;
 *  - discoverMode 'report' (manual scans): returned in `report.discovered` for
 *    the user to review/edit and confirm before anything is saved.
 * Logged to ipmgt_scan_history for the Scans page either way.
 */
export async function scanSubnet(subnet: SubnetRow, opts: { concurrency: number; pingTimeoutSeconds: number; trigger: 'manual' | 'scheduled'; actor?: string; discoverMode?: 'auto-add' | 'report' }): Promise<ScanReport> {
  const db = getDb()
  const historyId = nanoid()
  const startedAt = new Date().toISOString()
  await db.query(
    `INSERT INTO ipmgt_scan_history (id, subnet_id, trigger, started_at, actor) VALUES ($1,$2,$3,$4,$5)`,
    [historyId, subnet.id, opts.trigger, startedAt, opts.actor || null]
  )

  const discoverMode = opts.discoverMode || 'auto-add'
  const report: ScanReport = { hostsScanned: 0, hostsUp: 0, newHosts: 0 }
  if (discoverMode === 'report') report.discovered = []
  try {
    const { rows: existingRows } = await db.query('SELECT id, ip FROM ipmgt_ips WHERE subnet_id = $1', [subnet.id])
    const existingByIp = new Map<string, string>()
    for (const r of existingRows) { try { existingByIp.set(canonicalizeIp(r.ip), r.id) } catch { /* skip */ } }

    if (subnet.ping_enabled) {
      await mapLimit(existingRows, opts.concurrency, async (r: any) => {
        const result = await pingHost(r.ip, opts.pingTimeoutSeconds)
        report.hostsScanned++
        const now = new Date().toISOString()
        if (result.alive) {
          report.hostsUp++
          await db.query('UPDATE ipmgt_ips SET last_seen = $2, last_scanned = $3 WHERE id = $1', [r.id, now, now])
        } else {
          await db.query('UPDATE ipmgt_ips SET last_scanned = $2 WHERE id = $1', [r.id, now])
        }
      })
    }

    if (subnet.scan_enabled) {
      const { cells } = enumerateHosts(subnet.network, subnet.gateway, 4096)
      const unknown = cells.filter((c) => !existingByIp.has(c.ip) && !c.isNetwork && !c.isBroadcast)
      await mapLimit(unknown, opts.concurrency, async (cell) => {
        const result = await pingHost(cell.ip, opts.pingTimeoutSeconds)
        report.hostsScanned++
        if (result.alive) {
          report.hostsUp++
          report.newHosts++
          const hostname = await resolveHostname(cell.ip)
          if (discoverMode === 'report') {
            report.discovered!.push({ ip: cell.ip, hostname, rttMs: result.rttMs })
          } else {
            const now = new Date().toISOString()
            await db.query(
              `INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, status, state, note, last_seen, last_scanned, created_at, created_by)
               VALUES ($1,$2,$3,$4,'used','used','Auto-discovered by scan',$5,$5,$5,'scanner')`,
              [nanoid(), subnet.id, cell.ip, hostname, now]
            )
          }
        }
      })
      report.discovered?.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
    }

    await db.query(
      `UPDATE ipmgt_scan_history SET finished_at = $2, hosts_scanned = $3, hosts_up = $4, new_hosts = $5 WHERE id = $1`,
      [historyId, new Date().toISOString(), report.hostsScanned, report.hostsUp, report.newHosts]
    )
  } catch (err: any) {
    await db.query(`UPDATE ipmgt_scan_history SET finished_at = $2, error = $3 WHERE id = $1`, [historyId, new Date().toISOString(), err?.message || String(err)])
    await logSystem('ipmgt', 'error', 'scan.failed', `Scan of subnet ${subnet.network} failed: ${err?.message || err}`)
    throw err
  }
  return report
}
