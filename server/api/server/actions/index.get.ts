import { getDb } from '../../../utils/db'

// Actions with their notification channel name.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT a.*, c.name AS channel_name, c.type AS channel_type
    FROM server_actions a LEFT JOIN alert_channels c ON c.id = a.channel_id
    ORDER BY a.name ASC
  `)
  return rows
})
