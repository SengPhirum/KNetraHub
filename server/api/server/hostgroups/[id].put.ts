import { getDb } from '../../../utils/db'

// Rename / re-describe a host group.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ name?: string; description?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Group name is required' })

  const db = getDb()
  const res = await db.query(
    'UPDATE server_host_groups SET name = $1, description = $2 WHERE id = $3',
    [name.slice(0, 120), (body.description || '').trim().slice(0, 500) || null, id]
  )
  if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  return { success: true }
})
