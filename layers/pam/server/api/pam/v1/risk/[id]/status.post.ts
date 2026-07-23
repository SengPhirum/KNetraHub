import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'

const STATUSES = ['open', 'investigating', 'resolved', 'dismissed']

/** Update a risk event's status/assignee/resolution (pam.audit.view + manager). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.audit.view')
  const id = getRouterParam(event, 'id')!
  await loadOr404('pam.risk_events', id, 'Risk event not found')
  const body = await readBody(event)
  const status = STATUSES.includes(body?.status) ? body.status : null
  if (!status) throw createError({ statusCode: 400, statusMessage: 'A valid status is required' })
  const now = nowIso()
  await getPamDb().query(
    'UPDATE pam.risk_events SET status=$2, assignee=$3, resolution=$4, updated_at=$5, resolved_at=CASE WHEN $2 IN (\'resolved\',\'dismissed\') THEN $5 ELSE resolved_at END WHERE id=$1',
    [id, status, body.assignee || user.username, body.resolution || null, now]
  )
  await pamAudit(event, user, { action: 'risk.status', objectType: 'risk_event', objectId: id, details: { status } })
  return { ok: true }
})
