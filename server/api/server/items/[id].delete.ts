import { getDb } from '../../../utils/db'

// Delete an item (its triggers cascade; history ages out via retention).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_items WHERE id = $1', [id])
  return { success: true }
})
