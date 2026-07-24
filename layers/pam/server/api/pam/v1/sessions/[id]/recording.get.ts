import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, loadOr404, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'
import { openRecording } from '~~/layers/pam/server/utils/pamRecording'

/**
 * Stream a decrypted recording to an authorized viewer. Object-store credentials
 * are never exposed — the control plane decrypts and serves the bytes. Supports
 * HTTP range requests for the player. Every access is audited; responses are
 * no-store so recordings are never cached by the browser/proxies.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const sessionId = getRouterParam(event, 'id')!
  const session = await loadOr404<any>('pam.sessions', sessionId, 'Session not found')

  const canView = tierGrantsPermission('pam', tier, 'pam.recording.view') || tierGrantsPermission('pam', tier, 'pam.session.monitor')
  const owns = session.principal?.toLowerCase() === user.username.toLowerCase()
  if (!canView && !owns) throw createError({ statusCode: 403, statusMessage: 'You cannot view this recording' })

  const db = getPamDb()
  const recId = getQuery(event).recordingId
    ? String(getQuery(event).recordingId)
    : (await db.query('SELECT id FROM pam.session_recordings WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [sessionId])).rows[0]?.id
  if (!recId) throw createError({ statusCode: 404, statusMessage: 'No recording for this session' })

  const rec = await openRecording(recId, db)
  if (!rec) throw createError({ statusCode: 404, statusMessage: 'Recording not found or has no stored object' })

  await pamAudit(event, user, { action: 'recording.view', objectType: 'recording', objectId: recId, sessionId, safeId: session.safe_id ?? null, severity: 'notice', details: { format: rec.format } })

  setResponseHeader(event, 'cache-control', 'no-store, max-age=0')
  setResponseHeader(event, 'content-type', rec.format === 'asciicast' ? 'application/x-asciicast' : 'application/octet-stream')
  setResponseHeader(event, 'accept-ranges', 'bytes')

  const range = getRequestHeader(event, 'range')
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (m) {
    const total = rec.data.length
    const start = m[1] ? parseInt(m[1], 10) : 0
    const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1
    if (start > end || start >= total) throw createError({ statusCode: 416, statusMessage: 'range not satisfiable' })
    setResponseStatus(event, 206)
    setResponseHeader(event, 'content-range', `bytes ${start}-${end}/${total}`)
    return rec.data.subarray(start, end + 1)
  }
  return rec.data
})
