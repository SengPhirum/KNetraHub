import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'

/** Revoke a grant (manager: pam.session.terminate). Terminates any live session using it. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.session.terminate')
  const id = getRouterParam(event, 'id')!
  const grant = await loadOr404<any>('pam.access_grants', id, 'Grant not found')
  if (grant.status !== 'active') throw createError({ statusCode: 409, statusMessage: `Grant is ${grant.status}` })
  const body = await readBody(event).catch(() => ({}))
  const reason = String(body?.reason || 'revoked by administrator')

  const db = getPamDb()
  await db.query("UPDATE pam.access_grants SET status='revoked', revoked_by=$2, revoked_at=$3, revoke_reason=$4 WHERE id=$1", [id, user.username, nowIso(), reason])
  // Terminate live sessions immediately, then enqueue post-revocation cleanup.
  await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason=$3 WHERE grant_id=$1 AND state IN ('starting','active','idle')", [id, nowIso(), 'grant revoked'])
  await enqueueJob({ jobType: 'revoke_grant', accountId: grant.account_id, trigger: 'manual', payload: { grantId: id, reason }, createdBy: user.username, priority: 10 }, db)
  await pamAudit(event, user, { action: 'grant.revoke', objectType: 'grant', objectId: id, severity: 'high', reason })
  return { ok: true }
})
