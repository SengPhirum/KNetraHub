import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** PAM audit trail with filters (pam.audit.view). Hash/prev_hash included for transparency. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.audit.view')
  const db = getPamDb()
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (q.actor) { where.push(`actor = $${i++}`); params.push(String(q.actor)) }
  if (q.action) { where.push(`action LIKE $${i++}`); params.push(`%${q.action}%`) }
  if (q.objectId) { where.push(`object_id = $${i++}`); params.push(String(q.objectId)) }
  if (q.severity) { where.push(`severity = $${i++}`); params.push(String(q.severity)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Number(q.limit) || 100, 500)
  const [rows, ckpt] = await Promise.all([
    db.query(
      `SELECT seq, id, ts, actor, actor_source, source_ip, action, object_type, object_id, safe_id,
              request_id, session_id, result, reason, ticket, severity, details, hash, prev_hash, signing_key_version
         FROM pam.audit_events ${whereSql} ORDER BY seq DESC LIMIT ${limit}`,
      params
    ),
    db.query('SELECT id, seq_from, seq_to, event_count, ts, verified_ok FROM pam.audit_checkpoints ORDER BY seq_to DESC LIMIT 5')
  ])
  return { events: rows.rows, checkpoints: ckpt.rows }
})
