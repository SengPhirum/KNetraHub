import { requireUser } from '~~/server/utils/auth'
import { computeOverview } from '~~/layers/docker/server/utils/dashboardSnapshot'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return computeOverview()
})
