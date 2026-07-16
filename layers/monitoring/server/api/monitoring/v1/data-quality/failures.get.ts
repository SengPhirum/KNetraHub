import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/**
 * GET /api/monitoring/v1/data-quality/failures — recent failed/timed-out
 * collection attempts across the fleet, with device + module + reason.
 */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])
  const query = getQuery(event)

  const args: unknown[] = []
  let deviceFilter = ''
  if (query.device_id) {
    args.push(Number(query.device_id))
    deviceFilter = `AND ca.device_id = $${args.length}`
  }

  const rows = await db.query(
    `SELECT ca.time, ca.device_id, d.hostname, ca.module, ca.item, ca.outcome, ca.detail, ca.duration_ms
     FROM monitoring.collection_attempts ca
     LEFT JOIN monitoring.devices d ON d.id = ca.device_id
     WHERE ca.outcome IN ('timeout','auth_failure','parse_error','db_error','failed') ${deviceFilter}
     ORDER BY ca.time DESC
     LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  const byOutcome = await db.query(
    `SELECT outcome, count(*)::int AS c FROM monitoring.collection_attempts
     WHERE time > now() - interval '24 hours'
       AND outcome IN ('timeout','auth_failure','parse_error','db_error','failed','unsupported')
     GROUP BY outcome ORDER BY c DESC`
  )
  return { ...listEnvelope(rows.rows, rows.rows.length, p), by_outcome_24h: byOutcome.rows }
})
