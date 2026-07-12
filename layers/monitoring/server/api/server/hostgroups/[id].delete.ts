import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Delete a host group (membership rows cascade).
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_host_groups WHERE id = $1', [id])
  return { success: true }
})
