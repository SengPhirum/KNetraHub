import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query(`
    SELECT *
    FROM net_backups
    WHERE device_id = $1
    ORDER BY timestamp DESC
  `, [id])
  return res.rows
})
