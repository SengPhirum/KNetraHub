import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'

/** Add an investigation marker to a session (manager: pam.session.monitor). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.session.monitor')
  const id = getRouterParam(event, 'id')!
  await loadOr404('pam.sessions', id, 'Session not found')
  const body = await readBody(event)
  const label = String(body?.label || '').trim()
  if (!label) throw createError({ statusCode: 400, statusMessage: 'A marker label is required' })
  const markerId = newId()
  await getPamDb().query(
    `INSERT INTO pam.session_markers (id, session_id, offset_ms, label, kind, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [markerId, id, body.offset_ms ? Number(body.offset_ms) : null, label, body.kind || 'note', user.username, nowIso()]
  )
  await pamAudit(event, user, { action: 'session.marker.add', objectType: 'session', objectId: id, sessionId: id, details: { label } })
  return { id: markerId }
})
