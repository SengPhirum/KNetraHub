import { requireUser } from '~~/server/utils/auth'
import { assertSwarm } from '~~/layers/docker/server/utils/docker'
import { computeMetrics } from '~~/layers/docker/server/utils/dashboardSnapshot'

const VALID_RANGES = new Set(['1h', '6h', '24h', '7d'])

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()

  const q = getQuery(event)
  const range = VALID_RANGES.has(q.range as string) ? (q.range as string) : '6h'
  return computeMetrics(range)
})
