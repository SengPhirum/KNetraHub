import { getDb } from '~~/server/utils/db'

// Zabbix host groups with their host counts.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT g.*, COUNT(m.host_id)::int AS host_count
    FROM server_host_groups g
    LEFT JOIN server_host_group_members m ON m.group_id = g.id
    GROUP BY g.id
    ORDER BY g.name ASC
  `)
  return rows
})
