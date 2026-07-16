import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/alerts/templates */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT id, name, title_template, body_template, is_default, created_at, updated_at FROM monitoring.alert_templates`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY name LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
