import { getDb } from '../../utils/db'
import { nanoid } from 'nanoid'

// Create a device group (logical organization, like a PRTG group/folder).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; description?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Group name is required' })

  const db = getDb()
  const id = nanoid()
  await db.query(
    'INSERT INTO net_groups (id, name, description, created_at) VALUES ($1, $2, $3, $4)',
    [id, name.slice(0, 120), (body.description || '').trim().slice(0, 500) || null, new Date().toISOString()]
  )
  return { id }
})
