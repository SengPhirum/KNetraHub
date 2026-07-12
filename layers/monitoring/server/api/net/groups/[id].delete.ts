import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Delete a group. Membership rows in net_device_groups cascade away; the
// devices themselves are untouched.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  await getDb().query('DELETE FROM net_groups WHERE id = $1', [id])
  return { success: true }
})
