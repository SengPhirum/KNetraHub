import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const result = await db.query('SELECT * FROM net_devices ORDER BY hostname ASC')
  return result.rows
})
