import { getDb } from '../../../utils/db'
import { nanoid } from 'nanoid'

// Create an empty map (nodes/links added in the editor).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Map name is required' })
  const db = getDb()
  const id = nanoid()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO server_maps (id, name, config, created_at, updated_at) VALUES ($1, $2, '{"nodes":[],"links":[]}', $3, $3)`,
    [id, name.slice(0, 120), now]
  )
  return { id }
})
