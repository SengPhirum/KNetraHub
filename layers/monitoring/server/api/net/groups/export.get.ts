import { getDb } from '~~/server/utils/db'

// All device groups (name/description only - membership isn't portable across
// environments since it references device ids), for the unified Groups page.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT name, description FROM net_groups ORDER BY name ASC')
  return res.rows
})
