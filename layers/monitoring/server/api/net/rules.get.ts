import { getDb } from '~~/server/utils/db'

// Alert rules (thresholds/conditions that turn sensor state into alerts).
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT * FROM net_alert_rules ORDER BY enabled DESC, severity ASC, name ASC')
  return res.rows
})
