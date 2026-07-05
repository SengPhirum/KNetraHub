import { requireUser } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'

const RANGES: Record<string, { lookback: string; bucket: string }> = {
  '1h': { lookback: '1 hour', bucket: '15 seconds' },
  '6h': { lookback: '6 hours', bucket: '1 minute' },
  '24h': { lookback: '24 hours', bucket: '5 minutes' },
  '7d': { lookback: '7 days', bucket: '30 minutes' }
}

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const q = getQuery(event)
  const range = RANGES[q.range as string] ? (q.range as string) : '1h'
  const { lookback, bucket } = RANGES[range]!
  const db = getDb()

  const [cpuMem, network] = await Promise.all([
    db.query(
      `SELECT bucket,
              sum(cpu_percent) AS cpu_percent,
              sum(memory_used) AS memory_used,
              sum(memory_limit) AS memory_limit
       FROM (
         SELECT time_bucket($1::interval, time) AS bucket,
                container_id,
                avg(cpu_percent) AS cpu_percent,
                avg(memory_used) AS memory_used,
                avg(memory_limit) AS memory_limit
         FROM container_metrics
         WHERE service_id = $2 AND time > now() - $3::interval
         GROUP BY bucket, container_id
       ) per_container
       GROUP BY bucket
       ORDER BY bucket`,
      [bucket, id, lookback]
    ),
    db.query(
      `SELECT bucket,
              sum(rx_delta) / extract(epoch FROM $1::interval) AS rx_bytes_per_sec,
              sum(tx_delta) / extract(epoch FROM $1::interval) AS tx_bytes_per_sec
       FROM (
         SELECT container_id,
                time_bucket($1::interval, time) AS bucket,
                max(rx_bytes) - min(rx_bytes) AS rx_delta,
                max(tx_bytes) - min(tx_bytes) AS tx_delta
         FROM network_usage
         WHERE service_id = $2 AND time > now() - $3::interval
         GROUP BY container_id, bucket
       ) per_container
       GROUP BY bucket
       ORDER BY bucket`,
      [bucket, id, lookback]
    )
  ])

  return {
    range,
    serviceId: id,
    series: {
      cpu: cpuMem.rows.map((r: any) => ({ time: r.bucket, percent: Number(r.cpu_percent || 0) })),
      memory: cpuMem.rows.map((r: any) => ({
        time: r.bucket,
        used: Number(r.memory_used || 0),
        limit: Number(r.memory_limit || 0)
      })),
      network: network.rows.map((r: any) => ({
        time: r.bucket,
        rxBytesPerSec: Number(r.rx_bytes_per_sec || 0),
        txBytesPerSec: Number(r.tx_bytes_per_sec || 0)
      }))
    }
  }
})
