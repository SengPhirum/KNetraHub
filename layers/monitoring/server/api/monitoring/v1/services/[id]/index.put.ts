import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'
import { normalizeServiceBody } from '../index.post'

/** PUT /api/monitoring/v1/services/:id — replace a service check (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)
  const s = normalizeServiceBody(body)

  const res = await db.query(
    `UPDATE monitoring.services SET name = $2, type = $3, params = $4, device_id = $5,
       interval_seconds = $6, retry_interval_seconds = $7, timeout_ms = $8,
       warn_response_ms = $9, crit_response_ms = $10, enabled = $11, poller_group = $12,
       next_check_at = LEAST(next_check_at, now() + make_interval(secs => $6)), updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id, s.name, s.type, JSON.stringify(s.params), s.device_id, s.interval_seconds, s.retry_interval_seconds,
      s.timeout_ms, s.warn_response_ms, s.crit_response_ms, s.enabled, s.poller_group]
  )
  if (!res.rowCount) notFound('service')
  await auditMonitoring(user.username, 'service.update', String(id), `name=${s.name}`)
  return { id, updated: true }
})
