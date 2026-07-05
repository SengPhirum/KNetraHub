import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const res = await db.query(`
    SELECT g.*, COUNT(dg.device_id) as device_count
    FROM net_groups g
    LEFT JOIN net_device_groups dg ON g.id = dg.group_id
    GROUP BY g.id
    ORDER BY g.name ASC
  `)
  return res.rows
})
