import { getDb } from '../../../utils/db'

// Delete a host group (membership rows cascade).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_host_groups WHERE id = $1', [id])
  return { success: true }
})
