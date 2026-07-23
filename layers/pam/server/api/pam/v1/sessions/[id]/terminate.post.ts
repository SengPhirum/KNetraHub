import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'

/**
 * Terminate a live session (manager: pam.session.terminate). Optionally disable
 * the account and/or rotate its credential as a containment action.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.session.terminate')
  const id = getRouterParam(event, 'id')!
  const session = await loadOr404<any>('pam.sessions', id, 'Session not found')
  if (!['starting', 'active', 'idle'].includes(session.state)) {
    throw createError({ statusCode: 409, statusMessage: `Session is ${session.state}` })
  }
  const body = await readBody(event).catch(() => ({}))
  const reason = String(body?.reason || 'terminated by monitor')
  const db = getPamDb()
  const now = nowIso()

  await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason=$3, last_activity_at=$2 WHERE id=$1", [id, now, reason])
  await db.query('INSERT INTO pam.session_events (id, session_id, ts, kind, detail) VALUES ($1,$2,$3,$4,$5)',
    [newId(), id, now, 'session.terminated', JSON.stringify({ by: user.username, reason })])

  if (body?.disable_account && session.account_id) {
    await db.query('UPDATE pam.accounts SET enabled=false WHERE id=$1', [session.account_id])
  }
  if (body?.rotate_credential && session.account_id) {
    await enqueueJob({ jobType: 'rotate', accountId: session.account_id, trigger: 'after-session-terminate', createdBy: user.username, priority: 20 }, db)
  }
  await pamAudit(event, user, { action: 'session.terminate', objectType: 'session', objectId: id, sessionId: id, severity: 'high', reason })
  return { ok: true }
})
