import { getDb } from '../../../../utils/db'

// Remove a template trigger definition.
export default defineEventHandler(async (event) => {
  const triggerId = getRouterParam(event, 'triggerId')
  const db = getDb()
  await db.query('DELETE FROM server_template_triggers WHERE id = $1', [triggerId])
  return { success: true }
})
