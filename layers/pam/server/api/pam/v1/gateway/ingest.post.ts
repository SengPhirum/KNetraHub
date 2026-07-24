import { getPamDb } from '~~/server/utils/moduleDb'
import { verifyGatewayToken } from '~~/layers/pam/server/utils/pamGateway'
import { newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { appendAudit } from '~~/layers/pam/server/utils/pamAudit'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'

/**
 * Gateway → control-plane ingest. The session gateway (SSH bastion / guacd
 * adapter) authenticates with its short-lived gateway token and streams back
 * session events, the command log, and recording metadata (the recording bytes
 * themselves live in object storage; only the checksum + keyed signature are
 * recorded here for integrity). This is the callback the real gateway uses; it
 * is also how integration tests simulate a gateway to complete the pipeline.
 */
export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = token ? await verifyGatewayToken(token) : null
  if (!claims) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired gateway token' })

  const body = await readBody(event)
  const db = getPamDb()
  const sess = await db.query("SELECT id, state FROM pam.sessions WHERE id=$1", [claims.sessionId])
  if (!sess.rows.length) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  const now = nowIso()

  // State transition (starting → active/idle/ended).
  if (body?.state && ['active', 'idle', 'ended', 'error'].includes(body.state)) {
    await db.query('UPDATE pam.sessions SET state=$2, last_activity_at=$3, ended_at=CASE WHEN $2 IN (\'ended\',\'error\') THEN $3 ELSE ended_at END WHERE id=$1 AND state NOT IN (\'terminated\')',
      [claims.sessionId, body.state, now])
  } else {
    await db.query("UPDATE pam.sessions SET last_activity_at=$2 WHERE id=$1", [claims.sessionId, now])
  }

  // Events.
  for (const ev of Array.isArray(body?.events) ? body.events : []) {
    await db.query('INSERT INTO pam.session_events (id, session_id, ts, kind, detail) VALUES ($1,$2,$3,$4,$5)',
      [newId(), claims.sessionId, ev.ts || now, String(ev.kind || 'event'), ev.detail ? JSON.stringify(ev.detail) : null])
  }

  // Commands (with denylist blocking flag from the gateway).
  const commands = Array.isArray(body?.commands) ? body.commands : []
  let seqBase = Number((await db.query('SELECT COALESCE(MAX(seq),0) s FROM pam.session_commands WHERE session_id=$1', [claims.sessionId])).rows[0].s)
  let blocked = 0
  for (const cmd of commands) {
    seqBase++
    if (cmd.blocked) blocked++
    await db.query('INSERT INTO pam.session_commands (id, session_id, ts, seq, command, risk, blocked, offset_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [newId(), claims.sessionId, cmd.ts || now, seqBase, String(cmd.command || '').slice(0, 4000), cmd.risk || null, cmd.blocked === true, cmd.offset_ms ? Number(cmd.offset_ms) : null])
  }
  if (commands.length) {
    await db.query('UPDATE pam.sessions SET command_count = command_count + $2, blocked_count = blocked_count + $3 WHERE id=$1',
      [claims.sessionId, commands.length, blocked])
    if (blocked > 0) {
      await recordRisk({ ruleKey: 'blocked_command', accountId: claims.accountId, sessionId: claims.sessionId, explanation: `${blocked} command(s) were blocked by policy in this session.` }, db)
    }
  }

  // Recording bytes are uploaded separately to POST /gateway/recording, which
  // runs the encrypt→store→independent-verify pipeline (pamRecording). The
  // control plane NEVER trusts a gateway-supplied checksum as proof of
  // integrity, so no recording row is created from ingest metadata here.

  await appendAudit({ actor: `gateway:${claims.user}`, action: 'session.ingest', objectType: 'session', objectId: claims.sessionId, sessionId: claims.sessionId, result: 'success', details: { events: (body?.events || []).length, commands: commands.length, recording: !!body?.recording } }, db).catch(() => {})
  return { ok: true }
})
