import { getDb } from '~~/server/utils/db'

// Latency + availability history for the /net dashboard graphs, time-bucketed
// from the net_metrics hypertable (written per device per poll cycle by
// server/plugins/netPoller.ts). Fleet-wide by default; pass ?device=<id> for a
// single device. Open like the rest of the net/* endpoints (UX-gated client
// side). Mirrors the RANGES/time_bucket pattern in nodes/[id]/metrics.get.ts.
const RANGES: Record<string, { lookback: string; bucket: string }> = {
  '1h': { lookback: '1 hour', bucket: '30 seconds' },
  '6h': { lookback: '6 hours', bucket: '2 minutes' },
  '24h': { lookback: '24 hours', bucket: '10 minutes' },
  '7d': { lookback: '7 days', bucket: '1 hour' }
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const range = RANGES[q.range as string] ? (q.range as string) : '1h'
  const { lookback, bucket } = RANGES[range]!
  const deviceId = typeof q.device === 'string' && q.device ? q.device : null
  const db = getDb()

  const where = deviceId ? 'time > now() - $2::interval AND device_id = $3' : 'time > now() - $2::interval'
  const params = deviceId ? [bucket, lookback, deviceId] : [bucket, lookback]

  const { rows } = await db.query(
    `SELECT time_bucket($1::interval, time) AS bucket,
            avg(rtt_ms) AS avg_ms,
            max(rtt_ms) AS max_ms,
            avg(up) * 100 AS up_percent
     FROM net_metrics
     WHERE ${where}
     GROUP BY bucket
     ORDER BY bucket`,
    params
  )

  return {
    range,
    deviceId,
    series: {
      latency: rows.map((r: any) => ({
        time: r.bucket,
        avgMs: r.avg_ms == null ? null : Math.round(Number(r.avg_ms)),
        maxMs: r.max_ms == null ? null : Math.round(Number(r.max_ms))
      })),
      availability: rows.map((r: any) => ({
        time: r.bucket,
        upPercent: r.up_percent == null ? null : Math.round(Number(r.up_percent))
      }))
    }
  }
})
