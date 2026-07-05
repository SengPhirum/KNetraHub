import { getDb } from '~~/server/utils/db'

// Remove a template item definition.
export default defineEventHandler(async (event) => {
  const itemId = getRouterParam(event, 'itemId')
  const db = getDb()
  await db.query('DELETE FROM server_template_items WHERE id = $1', [itemId])
  return { success: true }
})
