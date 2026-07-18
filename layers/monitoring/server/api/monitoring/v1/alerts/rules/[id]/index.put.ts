import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, conflict, notFound } from '../../../../../../utils/monApi'
import { validateConditions } from '../../../../../../alerting/conditions'
import { ALERT_SEVERITIES, ENTITY_TYPES } from '../../../../../../../shared/constants'

/** PUT /api/monitoring/v1/alerts/rules/:id — update an alert rule (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const existing = await db.query(`SELECT id FROM monitoring.alert_rules WHERE id = $1`, [id])
  if (!existing.rows.length) notFound('alert rule')

  const sets: string[] = []
  const args: unknown[] = [id]
  const set = (col: string, value: unknown) => {
    args.push(value)
    sets.push(`${col} = $${args.length}`)
  }

  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) badRequest('name cannot be empty')
    set('name', name)
  }
  if (body?.enabled !== undefined) set('enabled', !!body.enabled)
  if (body?.severity !== undefined) {
    if (!ALERT_SEVERITIES.includes(body.severity)) badRequest(`severity must be one of ${ALERT_SEVERITIES.join(', ')}`)
    set('severity', body.severity)
  }
  if (body?.entity_type !== undefined) {
    if (!ENTITY_TYPES.includes(body.entity_type)) badRequest(`entity_type must be one of ${ENTITY_TYPES.join(', ')}`)
    set('entity_type', body.entity_type)
  }
  if (body?.conditions !== undefined) {
    const problems = validateConditions(body.conditions)
    if (problems.length) badRequest(`invalid conditions: ${problems.join('; ')}`)
    set('conditions', JSON.stringify(body.conditions))
  }
  if (body?.device_ids !== undefined) set('device_ids', Array.isArray(body.device_ids) && body.device_ids.length ? body.device_ids.map(Number) : null)
  if (body?.group_ids !== undefined) set('group_ids', Array.isArray(body.group_ids) && body.group_ids.length ? body.group_ids.map(Number) : null)
  if (body?.location_ids !== undefined) set('location_ids', Array.isArray(body.location_ids) && body.location_ids.length ? body.location_ids.map(Number) : null)
  if (body?.delay_seconds !== undefined) set('delay_seconds', Math.max(0, Number(body.delay_seconds) || 0))
  if (body?.interval_seconds !== undefined) set('interval_seconds', Math.max(0, Number(body.interval_seconds) || 0))
  if (body?.max_notifications !== undefined) set('max_notifications', Math.max(0, Number(body.max_notifications) || 0))
  if (body?.recovery_notification !== undefined) set('recovery_notification', !!body.recovery_notification)
  if (body?.acknowledgeable !== undefined) set('acknowledgeable', !!body.acknowledgeable)
  if (body?.template_id !== undefined) set('template_id', body.template_id ? Number(body.template_id) : null)
  if (body?.note !== undefined) set('note', body.note ? String(body.note).slice(0, 4000) : null)
  if (body?.invert !== undefined) set('invert', !!body.invert)

  if (sets.length) {
    set('updated_at', new Date())
    try {
      await db.query(`UPDATE monitoring.alert_rules SET ${sets.join(', ')} WHERE id = $1`, args)
    } catch (err: any) {
      if (err?.code === '23505') conflict('a rule with that name already exists')
      throw err
    }
  }

  if (Array.isArray(body?.transport_ids)) {
    await db.query(`DELETE FROM monitoring.alert_rule_transports WHERE rule_id = $1`, [id])
    for (const tid of body.transport_ids) {
      await db.query(
        `INSERT INTO monitoring.alert_rule_transports (rule_id, transport_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, Number(tid)]
      )
    }
  }

  await auditMonitoring(user.username, 'rule.update', String(id))
  return { id, updated: true }
})
