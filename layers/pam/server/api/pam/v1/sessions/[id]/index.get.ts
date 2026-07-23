import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** Session detail: metadata, events, commands, markers and recording metadata. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const session = await loadOr404<any>('pam.sessions', id, 'Session not found')
  const canMonitor = tierGrantsPermission('pam', tier, 'pam.session.monitor')
  if (session.principal.toLowerCase() !== user.username.toLowerCase() && !canMonitor) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot view this session' })
  }
  const db = getPamDb()
  const canSeeCommands = canMonitor || tierGrantsPermission('pam', tier, 'pam.recording.view')
  const [events, commands, markers, recording] = await Promise.all([
    db.query('SELECT id, ts, kind, detail FROM pam.session_events WHERE session_id=$1 ORDER BY ts ASC LIMIT 1000', [id]),
    canSeeCommands ? db.query('SELECT id, ts, seq, command, risk, blocked, offset_ms FROM pam.session_commands WHERE session_id=$1 ORDER BY seq ASC LIMIT 2000', [id]) : Promise.resolve({ rows: [] }),
    db.query('SELECT * FROM pam.session_markers WHERE session_id=$1 ORDER BY offset_ms ASC', [id]),
    db.query('SELECT id, format, storage_backend, size_bytes, duration_ms, encrypted, checksum, integrity_ok, integrity_checked_at, created_at FROM pam.session_recordings WHERE session_id=$1 ORDER BY created_at DESC', [id])
  ])
  return { session, events: events.rows, commands: commands.rows, markers: markers.rows, recordings: recording.rows, canMonitor }
})
