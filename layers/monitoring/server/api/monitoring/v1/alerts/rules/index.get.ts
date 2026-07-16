import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/alerts/rules — list alert rules with transport bindings. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const rows = await db.query(
    `SELECT r.*,
       (SELECT count(*)::int FROM monitoring.alerts a WHERE a.rule_id = r.id AND a.state IN ('open','acknowledged')) AS active_alerts,
       COALESCE((SELECT array_agg(transport_id) FROM monitoring.alert_rule_transports WHERE rule_id = r.id), '{}') AS transport_ids
     FROM monitoring.alert_rules r ORDER BY r.name`
  )
  return { items: rows.rows, total: rows.rows.length }
})
