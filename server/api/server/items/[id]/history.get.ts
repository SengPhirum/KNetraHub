import { getDb } from '../../../../utils/db'

// Bucketed history for one item (Zabbix item graph). Mirrors the net sensor
// metrics endpoint: time_bucket avg/min/max over server_item_history, plus the
// item's unit/last value. Open like the rest of server/* (UX-gated client side).
const RANGES: Record<string, { lookback: string; bucket: string }> = {
  '1h': { lookback: '1 hour', bucket: '30 seconds' },
  '6h': { lookback: '6 hours', bucket: '2 minutes' },
  '24h': { lookback: '24 hours', bucket: '10 minutes' },
  '7d': { lookback: '7 days', bucket: '1 hour' }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const q = getQuery(event)
  const range = RANGES[q.range as string] ? (q.range as string) : '6h'
  const { lookback, bucket } = RANGES[range]!
  const db = getDb()

  const itemRes = await db.query('SELECT name, units, last_value, last_clock FROM server_items WHERE id = $1', [id])
  const item = itemRes.rows[0] || {}

  const { rows } = await db.query(
    `SELECT time_bucket($1::interval, time) AS bucket,
            avg(value_num) AS avg, max(value_num) AS max, min(value_num) AS min
     FROM server_item_history
     WHERE item_id = $3 AND time > now() - $2::interval
     GROUP BY bucket ORDER BY bucket`,
    [bucket, lookback, id]
  )

  return {
    range,
    itemId: id,
    name: item.name ?? null,
    units: item.units ?? null,
    lastValue: item.last_value == null ? null : Number(item.last_value),
    points: rows.map((r: any) => ({
      time: new Date(r.bucket).toISOString(),
      avg: r.avg == null ? null : Math.round(Number(r.avg) * 100) / 100,
      max: r.max == null ? null : Math.round(Number(r.max) * 100) / 100,
      min: r.min == null ? null : Math.round(Number(r.min) * 100) / 100
    }))
  }
})
