import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/alerts/transports — transports (config secrets omitted). */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const rows = await db.query(
    `SELECT id, name, type, enabled, is_default, created_at, updated_at,
            (config IS NOT NULL AND config <> '') AS config_set
     FROM monitoring.alert_transports ORDER BY name`
  )
  return { items: rows.rows, total: rows.rows.length }
})
