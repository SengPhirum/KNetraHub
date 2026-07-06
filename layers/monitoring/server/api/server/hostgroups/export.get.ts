import { getDb } from '~~/server/utils/db'

// All host groups (name/description only), for the unified Groups page.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT name, description FROM server_host_groups ORDER BY name ASC')
  return res.rows
})
