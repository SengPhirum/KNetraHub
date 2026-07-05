import { getDb } from '~~/server/utils/db'

// Per-channel time-bucketed history for one sensor (PRTG's sensor graph). A
// "channel" is one line: ping sensors have a single 'value' channel, traffic
// sensors have 'in' + 'out'. Readings come from the net_sensor_readings
// hypertable (written per poll cycle by server/plugins/netPoller.ts). Mirrors
// the RANGES/time_bucket pattern in ../metrics.get.ts. Also returns the sensor's
// unit/limits + scanning interval + coverage so the detail page is one request.
// Open like the rest of the net/* endpoints (UX-gated client side).
const RANGES: Record<string, { lookback: string; bucket: string; lookbackSec: number; bucketSec: number }> = {
  '1h': { lookback: '1 hour', bucket: '30 seconds', lookbackSec: 3600, bucketSec: 30 },
  '6h': { lookback: '6 hours', bucket: '2 minutes', lookbackSec: 21600, bucketSec: 120 },
  '24h': { lookback: '24 hours', bucket: '10 minutes', lookbackSec: 86400, bucketSec: 600 },
  '7d': { lookback: '7 days', bucket: '1 hour', lookbackSec: 604800, bucketSec: 3600 }
}

// Stable, human channel order (primary first): value, then in/out, then others.
function orderChannels(channels: string[]): string[] {
  const rank: Record<string, number> = { value: 0, in: 1, out: 2 }
  return [...channels].sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9) || a.localeCompare(b))
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const q = getQuery(event)
  const range = RANGES[q.range as string] ? (q.range as string) : '6h'
  const { lookback, bucket, lookbackSec, bucketSec } = RANGES[range]!
  const db = getDb()

  const sensorRes = await db.query('SELECT unit, limit_high, limit_low FROM net_sensors WHERE id = $1', [id])
  const sensor = sensorRes.rows[0] || {}

  const { rows } = await db.query(
    `SELECT time_bucket($1::interval, time) AS bucket, channel,
            avg(value) AS avg
     FROM net_sensor_readings
     WHERE sensor_id = $3 AND time > now() - $2::interval
     GROUP BY bucket, channel
     ORDER BY bucket`,
    [bucket, lookback, id]
  )

  // Pivot (bucket, channel) rows into aligned per-channel arrays sharing one
  // ordered list of bucket timestamps.
  const bucketIndex = new Map<string, number>()
  const buckets: string[] = []
  const channelSet = new Set<string>()
  for (const r of rows) {
    const t = new Date(r.bucket).toISOString()
    if (!bucketIndex.has(t)) { bucketIndex.set(t, buckets.length); buckets.push(t) }
    channelSet.add(r.channel)
  }
  const channels = orderChannels([...channelSet])
  const series: Record<string, (number | null)[]> = {}
  for (const ch of channels) series[ch] = new Array(buckets.length).fill(null)
  for (const r of rows) {
    const idx = bucketIndex.get(new Date(r.bucket).toISOString())!
    series[r.channel]![idx] = r.avg == null ? null : Math.round(Number(r.avg) * 100) / 100
  }

  // Coverage: share of the expected buckets in the range that actually have data
  // (a rough uptime/collection proxy, PRTG-style).
  const expected = Math.max(1, Math.round(lookbackSec / bucketSec))
  const coveragePercent = Math.min(100, Math.round((buckets.length / expected) * 100))

  // Unusual: latest primary-channel bucket outside mean ± 2σ over the range.
  const primary = channels[0] ? series[channels[0]]!.filter((v): v is number => v != null) : []
  let unusual = false
  if (primary.length >= 5) {
    const mean = primary.reduce((a, b) => a + b, 0) / primary.length
    const variance = primary.reduce((a, b) => a + (b - mean) ** 2, 0) / primary.length
    const sd = Math.sqrt(variance)
    const latest = primary[primary.length - 1]!
    unusual = sd > 0 && Math.abs(latest - mean) > 2 * sd
  }

  const lastRes = await db.query('SELECT max(time) AS last FROM net_sensor_readings WHERE sensor_id = $1', [id])
  const cfg = useRuntimeConfig().net as { pollIntervalSeconds?: number }

  return {
    range,
    sensorId: id,
    unit: sensor.unit ?? null,
    limitHigh: sensor.limit_high == null ? null : Number(sensor.limit_high),
    limitLow: sensor.limit_low == null ? null : Number(sensor.limit_low),
    scanIntervalSeconds: Math.max(15, Number(cfg?.pollIntervalSeconds) || 60),
    channels,
    buckets,
    series,
    coveragePercent,
    unusual,
    lastReadingAt: lastRes.rows[0]?.last ? new Date(lastRes.rows[0].last).toISOString() : null
  }
})
