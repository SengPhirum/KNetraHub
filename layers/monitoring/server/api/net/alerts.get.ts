import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const res = await db.query(`
    SELECT a.*, r.name as rule_name, r.metric, r.condition, r.threshold, d.hostname as device_name
    FROM net_alerts a
    LEFT JOIN net_alert_rules r ON a.rule_id = r.id
    LEFT JOIN net_devices d ON a.device_id = d.id
    ORDER BY a.timestamp DESC
    LIMIT 500
  `)
  return res.rows
})
