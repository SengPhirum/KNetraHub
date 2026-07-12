import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'
import { logSystem } from '~~/server/utils/moduleLogs'

// Acknowledge / un-acknowledge a problem, optionally with a comment.
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ acknowledged?: boolean; comment?: string }>(event)
  const ack = body.acknowledged !== false
  const db = getDb()
  const res = await db.query(
    `UPDATE server_problems SET ack = $1, ack_at = $2, ack_by = $3, comment = COALESCE($4, comment)
     WHERE id = $5 RETURNING name, host_id`,
    [ack, ack ? new Date().toISOString() : null, ack ? user.username : null, (body.comment || '').slice(0, 500) || null, id]
  )
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Problem not found' })
  await logSystem('monitoring', 'info', ack ? 'server.problem.acked' : 'server.problem.unacked',
    `${user.username} ${ack ? 'acknowledged' : 'unacknowledged'} problem "${res.rows[0].name}"${body.comment ? ` - ${String(body.comment).slice(0, 200)}` : ''}`)
  return { success: true }
})
