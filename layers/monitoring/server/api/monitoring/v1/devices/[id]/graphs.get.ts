import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, badRequest } from '../../../../../utils/monApi'

/**
 * GET /api/monitoring/v1/devices/:id/graphs?graph=<name>&from=-24h
 *
 * Device-level aggregated time series for the LibreNMS-style device pages:
 *   traffic       — sum of in/out bps across every port
 *   cpu           — average usage across every processor
 *   memory        — stacked bytes (used/cached/buffered/free) for non-swap
 *                   pools, falling back to percent when byte series are absent
 *   memory_percent— average non-swap mempool usage percent
 *   storage       — average filesystem usage percent
 *   latency       — ICMP rtt (ms) per bucket
 *   loss          — ICMP loss percent per bucket (from icmp_up samples)
 *   availability  — ICMP availability percent per bucket
 *   poller        — poll run duration seconds per bucket
 *
 * Points are bucketed server-side (~180 buckets per range) so week/month
 * renders stay light regardless of poll interval.
 */
const RANGE_RE = /^-(\d+)(h|d|m)$/

function parseFrom(raw: string): Date {
  const m = raw.match(RANGE_RE)
  if (m) {
    const n = Number(m[1])
    const unitMs = m[2] === 'h' ? 3600000 : m[2] === 'd' ? 86400000 : 60000
    return new Date(Date.now() - n * unitMs)
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return new Date(Date.now() - 86400000)
  return d
}

/** Snap the ideal bucket (range/180) to a familiar step. */
function bucketSeconds(rangeMs: number): number {
  const ideal = rangeMs / 1000 / 180
  const steps = [60, 300, 900, 1800, 3600, 7200, 21600, 43200, 86400]
  for (const s of steps) if (ideal <= s) return s
  return steps[steps.length - 1]!
}

export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const query = getQuery(event)
  const graph = String(query.graph ?? '')
  const from = parseFrom(String(query.from ?? '-24h'))
  const rangeMs = Date.now() - from.getTime()
  const bucket = `${bucketSeconds(rangeMs)} seconds`

  const respond = (points: unknown[], extra: Record<string, unknown> = {}) =>
    ({ graph, from: from.toISOString(), points, ...extra })

  if (graph === 'traffic') {
    // Per-bucket per-port average first, then sum across ports — a plain
    // sum() would multiply by samples-per-bucket.
    const rows = await db.query(
      `SELECT b AS time, sum(in_avg) AS in_bps, sum(out_avg) AS out_bps FROM (
         SELECT time_bucket($2::interval, time) AS b, port_id,
                avg(in_bps) AS in_avg, avg(out_bps) AS out_avg
         FROM monitoring.port_metrics
         WHERE device_id = $1 AND time >= $3
         GROUP BY b, port_id
       ) s GROUP BY b ORDER BY b`,
      [id, bucket, from]
    )
    return respond(rows.rows)
  }

  if (graph === 'cpu' || graph === 'memory_percent' || graph === 'storage') {
    const metric = graph === 'cpu' ? 'processor_usage'
      : graph === 'memory_percent' ? 'mempool_usage_percent' : 'storage_usage_percent'
    // Exclude swap pools from the headline memory percent.
    const joinSql = graph === 'memory_percent'
      ? 'JOIN monitoring.mempools mp ON mp.id = m.entity_id AND NOT mp.is_swap'
      : ''
    const rows = await db.query(
      `SELECT time_bucket($2::interval, m.time) AS time, avg(m.value) AS value
       FROM monitoring.metrics m ${joinSql}
       WHERE m.device_id = $1 AND m.metric = $3 AND m.time >= $4
       GROUP BY 1 ORDER BY 1`,
      [id, bucket, metric, from]
    )
    return respond(rows.rows)
  }

  if (graph === 'memory') {
    const rows = await db.query(
      `SELECT time,
              sum(avg_val) FILTER (WHERE metric = 'mempool_used_bytes') AS used_bytes,
              sum(avg_val) FILTER (WHERE metric = 'mempool_cached_bytes') AS cached_bytes,
              sum(avg_val) FILTER (WHERE metric = 'mempool_buffered_bytes') AS buffered_bytes,
              sum(avg_val) FILTER (WHERE metric = 'mempool_free_bytes') AS free_bytes,
              sum(avg_val) FILTER (WHERE metric = 'mempool_total_bytes') AS total_bytes
       FROM (
         SELECT time_bucket($2::interval, m.time) AS time, m.metric, m.entity_id, avg(m.value) AS avg_val
         FROM monitoring.metrics m
         JOIN monitoring.mempools mp ON mp.id = m.entity_id AND NOT mp.is_swap
         WHERE m.device_id = $1 AND m.time >= $3
           AND m.metric IN ('mempool_used_bytes','mempool_cached_bytes','mempool_buffered_bytes','mempool_free_bytes','mempool_total_bytes')
         GROUP BY 1, m.metric, m.entity_id
       ) s
       GROUP BY time ORDER BY time`,
      [id, bucket, from]
    )
    if (rows.rows.length) return respond(rows.rows, { mode: 'bytes' })
    // Byte series only exist from the first poll after this feature shipped —
    // older installs still render the percent line.
    const pct = await db.query(
      `SELECT time_bucket($2::interval, m.time) AS time, avg(m.value) AS value
       FROM monitoring.metrics m
       JOIN monitoring.mempools mp ON mp.id = m.entity_id AND NOT mp.is_swap
       WHERE m.device_id = $1 AND m.metric = 'mempool_usage_percent' AND m.time >= $3
       GROUP BY 1 ORDER BY 1`,
      [id, bucket, from]
    )
    return respond(pct.rows, { mode: 'percent' })
  }

  if (graph === 'latency' || graph === 'loss' || graph === 'availability') {
    const expr = graph === 'latency'
      ? `avg(value) FILTER (WHERE metric = 'icmp_rtt_ms')`
      : graph === 'loss'
        ? `(1 - avg(value) FILTER (WHERE metric = 'icmp_up')) * 100`
        : `avg(value) FILTER (WHERE metric = 'icmp_up') * 100`
    const rows = await db.query(
      `SELECT time_bucket($2::interval, time) AS time, ${expr} AS value
       FROM monitoring.metrics
       WHERE device_id = $1 AND metric IN ('icmp_rtt_ms','icmp_up') AND time >= $3
       GROUP BY 1 ORDER BY 1`,
      [id, bucket, from]
    )
    return respond(rows.rows)
  }

  if (graph === 'poller') {
    const rows = await db.query(
      `SELECT time_bucket($2::interval, started_at) AS time,
              avg(EXTRACT(EPOCH FROM (finished_at - started_at))) AS value
       FROM monitoring.poll_runs
       WHERE device_id = $1 AND kind = 'poll' AND finished_at IS NOT NULL AND started_at >= $3
       GROUP BY 1 ORDER BY 1`,
      [id, bucket, from]
    )
    return respond(rows.rows)
  }

  badRequest(`unknown graph "${graph}"`)
})
