import { getDb } from '../../../../utils/db'
import { readSession } from '~~/server/utils/auth'

// Acknowledge / un-acknowledge a problem, optionally with a comment.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ acknowledged?: boolean; comment?: string }>(event)
  const ack = body.acknowledged !== false
  const user = await readSession(event).catch(() => null)
  const db = getDb()
  await db.query(
    'UPDATE server_problems SET ack = $1, ack_at = $2, ack_by = $3, comment = COALESCE($4, comment) WHERE id = $5',
    [ack, ack ? new Date().toISOString() : null, ack ? (user?.username || 'operator') : null, (body.comment || '').slice(0, 500) || null, id]
  )
  return { success: true }
})
