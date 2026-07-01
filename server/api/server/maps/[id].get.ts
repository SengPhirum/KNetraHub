import { getDb } from '../../../utils/db'

// One map with its parsed config (nodes + links).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query('SELECT * FROM server_maps WHERE id = $1', [id])
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Map not found' })
  const row = res.rows[0]
  let config: any = { nodes: [], links: [] }
  try { config = JSON.parse(row.config || '{}'); config.nodes ||= []; config.links ||= [] } catch { /* keep default */ }
  return { id: row.id, name: row.name, config, updated_at: row.updated_at }
})
