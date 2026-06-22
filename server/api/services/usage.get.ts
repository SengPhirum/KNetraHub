import { requireUser } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'

export interface ServiceUsage {
  id: string
  available: boolean
  sampledAt: string | null
  cpuPercent: number
  memoryUsedBytes: number
  memoryLimitBytes: number
  containers: number
}

// Separate from /api/services (the heavier resource/spec listing) so the UI
// can poll just this lightweight endpoint every few seconds for live ring
// fills, mirroring /api/nodes + /api/nodes/usage's split.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const usageById = await latestServiceUsage()
  return {
    sampledAt: new Date().toISOString(),
    services: Array.from(usageById.entries()).map(([id, usage]) => ({ id, ...usage }))
  }
})

async function latestServiceUsage(): Promise<Map<string, Omit<ServiceUsage, 'id'>>> {
  try {
    const { rows } = await getDb().query(
      `SELECT service_id,
              sum(cpu_percent) AS cpu_percent,
              sum(memory_used) AS memory_used,
              sum(memory_limit) AS memory_limit,
              max(time) AS sampled_at,
              count(*) AS containers
       FROM (
         SELECT DISTINCT ON (service_id, COALESCE(task_id, container_id))
                service_id, task_id, container_id, cpu_percent, memory_used, memory_limit, time
         FROM container_metrics
         WHERE service_id IS NOT NULL AND lower(COALESCE(state, '')) = 'running' AND time > now() - interval '15 minutes'
         ORDER BY service_id, COALESCE(task_id, container_id), time DESC
       ) latest
       GROUP BY service_id`
    )
    return new Map(rows.map((r: any) => [r.service_id, {
      available: true,
      sampledAt: r.sampled_at,
      cpuPercent: Number(r.cpu_percent || 0),
      memoryUsedBytes: Number(r.memory_used || 0),
      memoryLimitBytes: Number(r.memory_limit || 0),
      containers: Number(r.containers || 0)
    }]))
  } catch {
    return new Map()
  }
}
