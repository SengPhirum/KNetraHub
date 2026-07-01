import { getDb } from '../../../utils/db'

// Recent discovery jobs, newest first.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM server_discovery_jobs ORDER BY started_at DESC LIMIT 50')
  return rows
})
