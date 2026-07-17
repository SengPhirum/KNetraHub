import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/** GET /api/monitoring/v1/memory/inde — read-only list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const inner = `SELECT m.id, m.description, m.total_bytes, m.used_bytes, m.usage_percent, m.is_swap, d.id AS device_id, d.hostname
     FROM monitoring.mempools m JOIN monitoring.devices d ON d.id = m.device_id WHERE m.stale_since IS NULL`
  const totalRes = await db.query(`SELECT count(*)::int AS c FROM (${inner}) t`)
  const rows = await db.query(`SELECT * FROM (${inner}) t ORDER BY usage_percent DESC NULLS LAST LIMIT $1 OFFSET $2`, [p.perPage, p.offset])
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
