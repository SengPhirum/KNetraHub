import { getDb } from '../../../utils/db'

// Delete a host (items, triggers, interfaces, memberships, problems cascade).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_hosts WHERE id = $1', [id])
  return { success: true }
})
