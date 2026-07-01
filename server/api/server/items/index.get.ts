import { getDb } from '../../../utils/db'

// Latest data: every item with its host + newest value. Optional ?host=<id>.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const hostId = typeof q.host === 'string' && q.host ? q.host : null
  const db = getDb()
  const where = hostId ? 'WHERE i.host_id = $1' : ''
  const params = hostId ? [hostId] : []
  const { rows } = await db.query(
    `SELECT i.*, h.name AS host_name
     FROM server_items i JOIN server_hosts h ON h.id = i.host_id
     ${where}
     ORDER BY h.name ASC, i.name ASC`,
    params
  )
  return rows
})
