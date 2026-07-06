import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const stepId = getRouterParam(event, 'stepId')
  const db = getDb()
  await db.query('DELETE FROM server_web_steps WHERE id = $1', [stepId])
  return { success: true }
})
