import { requireUser } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'

/**
 * The signed-in user's own recent sign-in history, read from the audit log
 * (auth.login events are recorded with actor = username). Self-service via
 * requireUser - returns only the caller's own events, not the global audit
 * (which stays admin-only at /api/system/audit).
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { rows } = await getDb().query(
    `SELECT id, action, detail, ts FROM audit
     WHERE actor = $1 AND action LIKE 'auth.login%'
     ORDER BY ts DESC LIMIT 50`,
    [me.username]
  )
  return rows.map((r: any) => ({
    id: r.id,
    action: r.action,
    detail: r.detail ?? '',
    ts: r.ts
  }))
})
