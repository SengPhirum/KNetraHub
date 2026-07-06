import { getDb } from '~~/server/utils/db'

// A single group with the list of member device ids (powers the Manage modal).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const g = await db.query('SELECT * FROM net_groups WHERE id = $1', [id])
  if (!g.rows.length) throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  const members = await db.query('SELECT device_id FROM net_device_groups WHERE group_id = $1', [id])
  return { ...g.rows[0], device_ids: members.rows.map((r) => r.device_id) }
})
