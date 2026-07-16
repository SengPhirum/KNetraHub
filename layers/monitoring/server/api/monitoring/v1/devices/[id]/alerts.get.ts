import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/alerts */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT a.id, a.state, a.severity, a.entity_type, a.entity_id, a.opened_at, a.acked_at, a.acked_by, a.recovered_at, r.name AS rule_name FROM monitoring.alerts a JOIN monitoring.alert_rules r ON r.id = a.rule_id WHERE a.device_id = $1 ORDER BY a.opened_at DESC LIMIT 200`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
