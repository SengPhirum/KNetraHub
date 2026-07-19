import { requireUser } from '~~/server/utils/auth'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

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

  const [cpuMem, disk, network] = await Promise.all([
    db.query(
      `SELECT time_bucket($1::interval, time) AS bucket,
              avg(cpu_percent) AS cpu_percent,
              avg(memory_used) AS memory_used,
              avg(memory_limit) AS memory_limit
       FROM node_metrics
       WHERE node_id = $2 AND time > now() - $3::interval
       GROUP BY bucket
       ORDER BY bucket`,
      [bucket, id, lookback]
    ),
    db.query(
      `SELECT time_bucket($1::interval, time) AS bucket,
              avg(used_bytes) AS used_bytes,
              avg(total_bytes) AS total_bytes,
              avg(percent) AS percent
       FROM disk_usage
       WHERE node_id = $2 AND time > now() - $3::interval
       GROUP BY bucket
       ORDER BY bucket`,
      [bucket, id, lookback]
    ),
    // rx/tx are cumulative counters per container - sum the per-bucket
    // (max - min) across containers, then convert to bytes/sec, rather than
    // averaging/summing the raw cumulative values directly.
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
         WHERE node_id = $2 AND time > now() - $3::interval
         GROUP BY container_id, bucket
       ) per_container
       GROUP BY bucket
       ORDER BY bucket`,
      [bucket, id, lookback]
    )
  ])

  return {
    range,
    nodeId: id,
    series: {
      cpu: cpuMem.rows.map((r: any) => ({ time: r.bucket, percent: Number(r.cpu_percent) })),
      memory: cpuMem.rows.map((r: any) => ({ time: r.bucket, used: Number(r.memory_used), limit: Number(r.memory_limit) })),
      disk: disk.rows.map((r: any) => ({ time: r.bucket, used: Number(r.used_bytes), total: Number(r.total_bytes), percent: Number(r.percent) })),
      network: network.rows.map((r: any) => ({ time: r.bucket, rxBytesPerSec: Number(r.rx_bytes_per_sec), txBytesPerSec: Number(r.tx_bytes_per_sec) }))
    }
  }
})
