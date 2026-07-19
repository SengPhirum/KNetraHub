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

  const { rows } = await db.query(
    `SELECT time_bucket($1::interval, time) AS bucket,
            avg(cpu_percent) AS cpu_percent,
            avg(memory_used) AS memory_used,
            avg(memory_limit) AS memory_limit
     FROM container_metrics
     WHERE task_id = $2 AND time > now() - $3::interval
     GROUP BY bucket
     ORDER BY bucket`,
    [bucket, id, lookback]
  )

  return {
    range,
    taskId: id,
    series: {
      cpu: rows.map((r: any) => ({ time: r.bucket, percent: Number(r.cpu_percent || 0) })),
      memory: rows.map((r: any) => ({ time: r.bucket, used: Number(r.memory_used || 0), limit: Number(r.memory_limit || 0) }))
    }
  }
})
