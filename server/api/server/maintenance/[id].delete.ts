import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  await db.query('DELETE FROM server_maintenance WHERE id = $1', [id])
  return { success: true }
})
