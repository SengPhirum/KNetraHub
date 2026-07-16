import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../utils/monApi'

/** POST /api/monitoring/v1/alerts/:id/ack — acknowledge an alert (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event).catch(() => ({}))
  const note = body?.note ? String(body.note).slice(0, 1000) : null
  const sticky = body?.sticky !== false

  const res = await db.query(
    `UPDATE monitoring.alerts SET state = 'acknowledged', acked_at = now(), acked_by = $2, ack_note = $3, ack_until_recovery = $4
     WHERE id = $1 AND state IN ('open','suppressed') RETURNING rule_id, device_id`,
    [id, user.username, note, sticky]
  )
  if (!res.rows.length) notFound('open alert')

  await db.query(
    `INSERT INTO monitoring.alert_log (alert_id, from_state, to_state, actor, note) VALUES ($1,'open','acknowledged',$2,$3)`,
    [id, user.username, note]
  )
  await auditMonitoring(user.username, 'alert.ack', String(id), note ?? undefined)
  return { id, state: 'acknowledged' }
})
