import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, loadOr404, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'
import { verifyRecording } from '~~/layers/pam/server/utils/pamRecording'

/**
 * Independently re-verify a recording's integrity: re-read the stored object,
 * recompute the checksum, and verify the keyed signature over the immutable
 * metadata. Never trusts the stored integrity flag — it recomputes.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const sessionId = getRouterParam(event, 'id')!
  const session = await loadOr404<any>('pam.sessions', sessionId, 'Session not found')
  if (!tierGrantsPermission('pam', tier, 'pam.recording.view') && !tierGrantsPermission('pam', tier, 'pam.session.monitor')) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot verify this recording' })
  }

  const db = getPamDb()
  const body = await readBody(event).catch(() => ({}))
  const recId = body?.recordingId
    ? String(body.recordingId)
    : (await db.query('SELECT id FROM pam.session_recordings WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [sessionId])).rows[0]?.id
  if (!recId) throw createError({ statusCode: 404, statusMessage: 'No recording for this session' })

  const verdict = await verifyRecording(recId, db)
  await pamAudit(event, user, { action: 'recording.verify', objectType: 'recording', objectId: recId, sessionId, safeId: session.safe_id ?? null, severity: verdict.ok ? 'notice' : 'high', result: verdict.ok ? 'success' : 'failure', details: verdict })
  return { recordingId: recId, ...verdict }
})
