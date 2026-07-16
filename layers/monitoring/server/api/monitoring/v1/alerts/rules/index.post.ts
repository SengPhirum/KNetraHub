import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../../utils/monApi'
import { validateConditions } from '../../../../../alerting/conditions'
import { ALERT_SEVERITIES, ENTITY_TYPES } from '../../../../../../shared/constants'

/** POST /api/monitoring/v1/alerts/rules — create an alert rule (admin tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  const severity = ALERT_SEVERITIES.includes(body?.severity) ? body.severity : 'critical'
  const entityType = ENTITY_TYPES.includes(body?.entity_type) ? body.entity_type : 'device'

  const problems = validateConditions(body?.conditions)
  if (problems.length) badRequest(`invalid conditions: ${problems.join('; ')}`)

  const res = await db.query(
    `INSERT INTO monitoring.alert_rules
       (name, enabled, severity, entity_type, conditions, device_ids, group_ids, location_ids,
        delay_seconds, interval_seconds, max_notifications, recovery_notification, template_id, note, invert)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [name, body?.enabled !== false, severity, entityType, JSON.stringify(body.conditions),
      body?.device_ids ?? null, body?.group_ids ?? null, body?.location_ids ?? null,
      Number(body?.delay_seconds ?? 0), Number(body?.interval_seconds ?? 0), Number(body?.max_notifications ?? 0),
      body?.recovery_notification !== false, body?.template_id ?? null, body?.note ?? null, !!body?.invert]
  )
  const ruleId = Number(res.rows[0].id)

  if (Array.isArray(body?.transport_ids)) {
    for (const tid of body.transport_ids) {
      await db.query(
        `INSERT INTO monitoring.alert_rule_transports (rule_id, transport_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [ruleId, Number(tid)]
      )
    }
  }
  await auditMonitoring(user.username, 'rule.create', String(ruleId), `name=${name}`)
  setResponseStatus(event, 201)
  return { id: ruleId }
})
