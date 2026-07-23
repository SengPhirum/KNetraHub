import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** List session recordings (manager: pam.recording.view). Metadata only. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.recording.view')
  const { rows } = await getPamDb().query(
    `SELECT r.id, r.session_id, r.format, r.storage_backend, r.size_bytes, r.duration_ms, r.encrypted,
            r.integrity_ok, r.integrity_checked_at, r.legal_hold, r.retention_until, r.created_at,
            s.principal, s.target, s.protocol, s.started_at, s.ended_at, a.name AS account_name
       FROM pam.session_recordings r
       JOIN pam.sessions s ON s.id = r.session_id
       LEFT JOIN pam.accounts a ON a.id = s.account_id
      ORDER BY r.created_at DESC LIMIT 200`
  )
  return rows
})
