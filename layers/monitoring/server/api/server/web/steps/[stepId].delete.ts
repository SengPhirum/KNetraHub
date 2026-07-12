import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const stepId = getRouterParam(event, 'stepId')
  const db = getDb()
  await db.query('DELETE FROM server_web_steps WHERE id = $1', [stepId])
  return { success: true }
})
