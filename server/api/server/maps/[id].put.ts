import { getDb } from '../../../utils/db'

// Save a map: rename and/or persist its node/link layout.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ name?: string; config?: { nodes?: any[]; links?: any[] } }>(event)
  const db = getDb()

  const cur = await db.query('SELECT name FROM server_maps WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Map not found' })

  // Sanitize the layout to the fields we render, clamping coordinates.
  const nodes = Array.isArray(body.config?.nodes) ? body.config!.nodes.map((n: any) => ({
    id: String(n.id),
    host_id: n.host_id ? String(n.host_id) : null,
    label: String(n.label || '').slice(0, 60),
    x: Math.max(0, Math.min(4000, Number(n.x) || 0)),
    y: Math.max(0, Math.min(4000, Number(n.y) || 0))
  })) : []
  const nodeIds = new Set(nodes.map((n) => n.id))
  const links = Array.isArray(body.config?.links) ? body.config!.links
    .map((l: any) => ({ from: String(l.from), to: String(l.to) }))
    .filter((l) => nodeIds.has(l.from) && nodeIds.has(l.to) && l.from !== l.to) : []

  const name = (body.name || cur.rows[0].name || '').trim().slice(0, 120) || cur.rows[0].name
  await db.query(
    'UPDATE server_maps SET name = $1, config = $2, updated_at = $3 WHERE id = $4',
    [name, JSON.stringify({ nodes, links }), new Date().toISOString(), id]
  )
  return { success: true }
})
