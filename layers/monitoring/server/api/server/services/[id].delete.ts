import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Delete a service; re-parent its children to its parent so the tree stays valid.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query('SELECT parent_id FROM server_services WHERE id = $1', [id])
  const parent = res.rows[0]?.parent_id ?? null
  await db.query('UPDATE server_services SET parent_id = $1 WHERE parent_id = $2', [parent, id])
  await db.query('DELETE FROM server_services WHERE id = $1', [id])
  return { success: true }
})
