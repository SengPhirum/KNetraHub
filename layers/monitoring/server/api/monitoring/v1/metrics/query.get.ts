import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, badRequest } from '../../../../utils/monApi'

/**
 * GET /api/monitoring/v1/metrics/query — time-series for a graph.
 * Params: kind=port|sensor|metric, id, from (ISO or relative like -24h),
 * columns (comma list). Uses continuous aggregates for long ranges.
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

export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const query = getQuery(event)
  const kind = String(query.kind ?? 'port')
  const id = Number(query.id)
  const deviceId = query.device_id != null ? Number(query.device_id) : null
  // Device-level series (entity_id = 0) are addressed by device_id instead.
  const idOk = kind === 'metric' && deviceId
    ? Number.isInteger(id) && id >= 0
    : Number.isInteger(id) && id > 0
  if (!idOk) badRequest('id is required')
  const from = parseFrom(String(query.from ?? '-24h'))
  const rangeMs = Date.now() - from.getTime()
  // Choose resolution: raw < 6h, 5m aggregate < 30d, 1h aggregate beyond.
  const useAgg = rangeMs > 6 * 3600000

  if (kind === 'port') {
    const table = useAgg ? 'monitoring.port_metrics_5m' : 'monitoring.port_metrics'
    const timeCol = useAgg ? 'bucket' : 'time'
    const cols = useAgg
      ? 'in_bps_avg AS in_bps, out_bps_avg AS out_bps, in_util_avg AS in_util_percent, out_util_avg AS out_util_percent'
      : 'in_bps, out_bps, in_util_percent, out_util_percent, in_errors_ps, out_errors_ps, in_discards_ps, out_discards_ps'
    const rows = await db.query(
      `SELECT ${timeCol} AS time, ${cols} FROM ${table} WHERE port_id = $1 AND ${timeCol} >= $2 ORDER BY ${timeCol}`,
      [id, from]
    ).catch(async () => db.query(
      `SELECT time, in_bps, out_bps, in_util_percent, out_util_percent FROM monitoring.port_metrics WHERE port_id = $1 AND time >= $2 ORDER BY time`,
      [id, from]
    ))
    return { kind, id, from: from.toISOString(), points: rows.rows }
  }

  if (kind === 'sensor') {
    const table = useAgg ? 'monitoring.sensor_metrics_5m' : 'monitoring.sensor_metrics'
    const timeCol = useAgg ? 'bucket' : 'time'
    const valueCol = useAgg ? 'value_avg AS value, value_min, value_max' : 'value'
    const rows = await db.query(
      `SELECT ${timeCol} AS time, ${valueCol} FROM ${table} WHERE sensor_id = $1 AND ${timeCol} >= $2 ORDER BY ${timeCol}`,
      [id, from]
    ).catch(async () => db.query(
      `SELECT time, value FROM monitoring.sensor_metrics WHERE sensor_id = $1 AND time >= $2 ORDER BY time`,
      [id, from]
    ))
    return { kind, id, from: from.toISOString(), points: rows.rows }
  }

  // generic metric series: id = entity_id, metric name required; device_id
  // scopes device-level series where entity_id is 0 for every device.
  const metric = String(query.metric ?? '')
  if (!metric) badRequest('metric name required for kind=metric')
  const args: unknown[] = [id, metric, from]
  let deviceFilter = ''
  if (deviceId) {
    args.push(deviceId)
    deviceFilter = ` AND device_id = $${args.length}`
  }
  const rows = await db.query(
    `SELECT time, value FROM monitoring.metrics WHERE entity_id = $1 AND metric = $2 AND time >= $3${deviceFilter} ORDER BY time`,
    args
  )
  return { kind, id, metric, from: from.toISOString(), points: rows.rows }
})
