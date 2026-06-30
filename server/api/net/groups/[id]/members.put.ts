import { getDb } from '../../../../utils/db'

// Replace a group's membership with the given device ids (set semantics).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ device_ids?: string[] }>(event)
  const ids = Array.isArray(body.device_ids) ? body.device_ids.filter((x) => typeof x === 'string') : []

  const db = getDb()
  const g = await db.query('SELECT id FROM net_groups WHERE id = $1', [id])
  if (!g.rows.length) throw createError({ statusCode: 404, statusMessage: 'Group not found' })

  await db.query('DELETE FROM net_device_groups WHERE group_id = $1', [id])
  for (const deviceId of ids) {
    await db.query(
      'INSERT INTO net_device_groups (device_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [deviceId, id]
    )
  }
  return { success: true, count: ids.length }
})
