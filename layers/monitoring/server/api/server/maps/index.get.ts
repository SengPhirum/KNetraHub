import { getDb } from '~~/server/utils/db'

// List saved maps (metadata only; config JSON fetched per-map).
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query('SELECT id, name, created_at, updated_at FROM server_maps ORDER BY name ASC')
  return rows
})
