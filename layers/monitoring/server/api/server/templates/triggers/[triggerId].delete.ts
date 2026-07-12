import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Remove a template trigger definition.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const triggerId = getRouterParam(event, 'triggerId')
  const db = getDb()
  await db.query('DELETE FROM server_template_triggers WHERE id = $1', [triggerId])
  return { success: true }
})
