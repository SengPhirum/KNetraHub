import { getPamDb } from '~~/server/utils/moduleDb'
import { verifyGatewayToken } from '~~/layers/pam/server/utils/pamGateway'
import { storeRecording } from '~~/layers/pam/server/utils/pamRecording'
import { appendAudit } from '~~/layers/pam/server/utils/pamAudit'

const MAX_BYTES = Number(process.env.PAM_RECORDING_MAX_BYTES || 512 * 1024 * 1024)

/**
 * Gateway → control-plane recording upload. The gateway streams the raw
 * recording bytes here (authenticated with its short-lived gateway token); the
 * control plane runs the encrypt→store→independently-verify pipeline. Object-
 * store credentials live ONLY in the control plane — never in the gateway.
 */
export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = token ? await verifyGatewayToken(token) : null
  if (!claims) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired gateway token' })

  const declared = Number(getRequestHeader(event, 'content-length') || 0)
  if (declared && declared > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'recording too large' })

  const raw = await readRawBody(event, false)
  const data = Buffer.isBuffer(raw) ? raw : raw ? Buffer.from(raw as any) : Buffer.alloc(0)
  if (!data.length) throw createError({ statusCode: 400, statusMessage: 'empty recording body' })
  if (data.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'recording too large' })

  const db = getPamDb()
  const sess = await db.query('SELECT id FROM pam.sessions WHERE id=$1', [claims.sessionId])
  if (!sess.rows.length) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  const res = await storeRecording({
    sessionId: claims.sessionId,
    data,
    format: getRequestHeader(event, 'x-pam-recording-format') || 'asciicast',
    durationMs: Number(getRequestHeader(event, 'x-pam-recording-duration-ms') || 0) || undefined
  }, db)

  await appendAudit({
    actor: `gateway:${claims.user}`, action: 'session.recording.store', objectType: 'session', objectId: claims.sessionId,
    sessionId: claims.sessionId, result: res.integrityOk ? 'success' : 'failure',
    severity: res.integrityOk ? 'notice' : 'high',
    details: { recordingId: res.id, size: res.size, integrityOk: res.integrityOk }
  }, db).catch(() => {})

  return { ok: true, recordingId: res.id, integrityOk: res.integrityOk, size: res.size }
})
