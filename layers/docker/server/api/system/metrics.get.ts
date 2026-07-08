import { requireUser } from '~~/server/utils/auth'
import { assertSwarm, useDocker } from '~~/layers/docker/server/utils/docker'
import { getDb } from '~~/server/utils/db'

const RANGES: Record<string, { lookback: string; bucket: string }> = {
  '1h': { lookback: '1 hour', bucket: '15 seconds' },
  '6h': { lookback: '6 hours', bucket: '1 minute' },
  '24h': { lookback: '24 hours', bucket: '5 minutes' },
  '7d': { lookback: '7 days', bucket: '30 minutes' }
}

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()

  const q = getQuery(event)
  const range = RANGES[q.range as string] ? (q.range as string) : '6h'
  const { lookback, bucket } = RANGES[range]!

  const docker = useDocker()
  const [services, nodes] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listNodes().catch(() => [])
  ])

  const serviceNames = new Map(services.map((service: any) => [service.ID, service.Spec?.Name || service.ID]))
  const nodeNames = new Map(nodes.map((node: any) => [node.ID, node.Description?.Hostname || node.ID]))

  let serviceRows: any[] = []
  let nodeRows: any[] = []
  let diskRows: any[] = []

  try {
    const db = getDb()
    const [serviceMetrics, nodeMetrics, diskMetrics] = await Promise.all([
      db.query(
        `SELECT bucket,
                service_id,
                sum(cpu_percent) AS cpu_percent,
                sum(memory_used) AS memory_used,
                sum(memory_limit) AS memory_limit
         FROM (
           SELECT time_bucket($1::interval, time) AS bucket,
                  service_id,
                  container_id,
                  avg(cpu_percent) AS cpu_percent,
                  avg(memory_used) AS memory_used,
                  avg(memory_limit) AS memory_limit
           FROM container_metrics
           WHERE service_id IS NOT NULL
             AND lower(COALESCE(state, '')) = 'running'
             AND time > now() - $2::interval
           GROUP BY bucket, service_id, container_id
         ) per_container
         GROUP BY bucket, service_id
         ORDER BY bucket`,
        [bucket, lookback]
      ),
      db.query(
        `SELECT time_bucket($1::interval, time) AS bucket,
                node_id,
                max(hostname) AS hostname,
                avg(cpu_percent) AS cpu_percent,
                avg(cpu_cores) AS cpu_cores,
                avg(memory_used) AS memory_used,
                avg(memory_limit) AS memory_limit,
                avg(memory_percent) AS memory_percent
         FROM node_metrics
         WHERE time > now() - $2::interval
         GROUP BY bucket, node_id
         ORDER BY bucket`,
        [bucket, lookback]
      ),
      db.query(
        `SELECT time_bucket($1::interval, time) AS bucket,
                node_id,
                avg(used_bytes) AS used_bytes,
                avg(total_bytes) AS total_bytes,
                avg(percent) AS percent
         FROM disk_usage
         WHERE time > now() - $2::interval
         GROUP BY bucket, node_id
         ORDER BY bucket`,
        [bucket, lookback]
      )
    ])

    serviceRows = serviceMetrics.rows
    nodeRows = nodeMetrics.rows
    diskRows = diskMetrics.rows
  } catch (err) {
    console.error('[system metrics] failed to load dashboard metrics', err)
  }

  return {
    sampledAt: new Date().toISOString(),
    range,
    bucket,
    services: serviceRows.map((row: any) => ({
      time: row.bucket,
      serviceId: row.service_id,
      serviceName: serviceNames.get(row.service_id) || row.service_id,
      cpuPercent: Number(row.cpu_percent || 0),
      memoryUsedBytes: Number(row.memory_used || 0),
      memoryLimitBytes: Number(row.memory_limit || 0)
    })),
    nodes: nodeRows.map((row: any) => ({
      time: row.bucket,
      nodeId: row.node_id,
      hostname: row.hostname || nodeNames.get(row.node_id) || row.node_id,
      cpuPercent: Number(row.cpu_percent || 0),
      cpuCores: Number(row.cpu_cores || 0),
      memoryUsedBytes: Number(row.memory_used || 0),
      memoryLimitBytes: Number(row.memory_limit || 0),
      memoryPercent: Number(row.memory_percent || 0)
    })),
    disk: diskRows.map((row: any) => ({
      time: row.bucket,
      nodeId: row.node_id,
      hostname: nodeNames.get(row.node_id) || row.node_id,
      usedBytes: Number(row.used_bytes || 0),
      totalBytes: Number(row.total_bytes || 0),
      percent: Number(row.percent || 0)
    }))
  }
})
