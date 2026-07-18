import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, conflict, notFound } from '../../../../../utils/monApi'

/**
 * DELETE /api/monitoring/v1/pollers/:id — remove a retired node's row (admin).
 * Refused while the node is still heartbeating; a live node would just
 * re-register on its next restart anyway.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) badRequest('invalid node id')

  const node = await db.query(`SELECT last_heartbeat_at FROM monitoring.poller_nodes WHERE id = $1`, [id])
  if (!node.rows.length) notFound('poller node')
  const last = node.rows[0].last_heartbeat_at ? new Date(node.rows[0].last_heartbeat_at).getTime() : 0
  if (Date.now() - last < 60_000) conflict('node is still heartbeating — stop it first')

  await db.query(`DELETE FROM monitoring.poller_nodes WHERE id = $1`, [id])
  await auditMonitoring(user.username, 'poller.remove', id)
  return { id, deleted: true }
})
