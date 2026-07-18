import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, notFound } from '../../../../../utils/monApi'

/**
 * PUT /api/monitoring/v1/pollers/:id — pause/resume a poller node (admin).
 * A paused node keeps heartbeating but claims no jobs; its poller-group work
 * stays pending until another node in the group (or a resume) picks it up.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = String(getRouterParam(event, 'id') ?? '').trim()
  if (!id) badRequest('invalid node id')
  const body = await readBody(event)
  if (typeof body?.enabled !== 'boolean') badRequest('enabled (boolean) is required')

  const res = await db.query(
    `UPDATE monitoring.poller_nodes SET enabled = $2 WHERE id = $1 RETURNING id`,
    [id, body.enabled]
  )
  if (!res.rowCount) notFound('poller node')
  await auditMonitoring(user.username, body.enabled ? 'poller.resume' : 'poller.pause', id)
  return { id, enabled: body.enabled }
})
