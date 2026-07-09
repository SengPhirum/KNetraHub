import { requireUser } from '~~/server/utils/auth'
import { assertSwarm } from '~~/layers/docker/server/utils/docker'
import { computeNodeUsage } from '~~/layers/docker/server/utils/dashboardSnapshot'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  return computeNodeUsage()
})
