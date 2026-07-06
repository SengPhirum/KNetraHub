import { getDb } from '~~/server/utils/db'

// History of auto-discovery scan jobs, newest first.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT * FROM net_discovery_jobs ORDER BY started_at DESC LIMIT 50')
  return res.rows
})
