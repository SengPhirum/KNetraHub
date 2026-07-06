import { getDb } from '~~/server/utils/db'

// All triggers with host + item context and current state.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT tr.*, h.name AS host_name, i.name AS item_name, i.key_ AS item_key, i.units AS item_units
    FROM server_triggers tr
    JOIN server_hosts h ON h.id = tr.host_id
    LEFT JOIN server_items i ON i.id = tr.item_id
    ORDER BY tr.severity DESC, h.name ASC, tr.name ASC
  `)
  return rows
})
