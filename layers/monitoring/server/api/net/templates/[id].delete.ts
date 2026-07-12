import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  await getDb().query('DELETE FROM net_device_templates WHERE id = $1', [id])
  return { success: true }
})
