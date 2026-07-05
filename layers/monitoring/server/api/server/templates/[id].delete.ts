import { getDb } from '~~/server/utils/db'

// Delete a template (its items/triggers/host-links cascade). Items already
// provisioned onto hosts are left in place.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_templates WHERE id = $1', [id])
  return { success: true }
})
