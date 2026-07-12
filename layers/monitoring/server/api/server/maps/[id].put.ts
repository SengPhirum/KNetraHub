import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Save a map: rename and/or persist its node/link layout.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ name?: string; config?: { nodes?: any[]; links?: any[] } }>(event)
  const db = getDb()

  const cur = await db.query('SELECT name FROM server_maps WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Map not found' })

  // Sanitize the layout to the fields we render, clamping coordinates. A node's
  // `type` says which domain it belongs to (Monitoring is unified, but a node
  // still points at either a Network device or a Server host); `ref_id` is that
  // entity's id. `host_id` is accepted as a legacy alias (pre-merge maps only
  // ever held server hosts) so old saved layouts keep working unchanged.
  const nodes = Array.isArray(body.config?.nodes) ? body.config!.nodes.map((n: any) => {
    const type = n.type === 'device' ? 'device' : 'host'
    const refId = n.ref_id != null ? String(n.ref_id) : (n.host_id != null ? String(n.host_id) : null)
    return {
      id: String(n.id),
      type,
      ref_id: refId,
      label: String(n.label || '').slice(0, 60),
      x: Math.max(0, Math.min(4000, Number(n.x) || 0)),
      y: Math.max(0, Math.min(4000, Number(n.y) || 0))
    }
  }) : []
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
