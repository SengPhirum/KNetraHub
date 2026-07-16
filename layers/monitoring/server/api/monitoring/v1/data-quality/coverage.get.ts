import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

/**
 * GET /api/monitoring/v1/data-quality/coverage — per-device collection
 * completeness derived from each device's most recent poll run. Powers the
 * Data Collection page (the no-silent-loss surface).
 */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, [])

  const rows = await db.query(
    `SELECT d.id AS device_id, d.hostname, d.status, d.last_polled_at,
            pr.status AS last_poll_status, pr.planned_items, pr.succeeded_items,
            pr.empty_items, pr.unsupported_items, pr.skipped_items, pr.failed_items,
            CASE WHEN pr.planned_items > 0
              THEN round(100.0 * (pr.succeeded_items + pr.empty_items + pr.unsupported_items + pr.skipped_items) / pr.planned_items, 1)
              ELSE NULL END AS completeness_percent,
            CASE
              WHEN d.last_polled_at IS NULL THEN 'never polled'
              WHEN d.last_polled_at < now() - make_interval(secs => COALESCE(d.poll_interval_seconds, 300) * 3) THEN 'stale'
              WHEN pr.failed_items > 0 THEN 'partial'
              WHEN pr.status = 'incomplete' THEN 'partial'
              ELSE 'complete'
            END AS coverage_state
     FROM monitoring.devices d
     LEFT JOIN LATERAL (
       SELECT * FROM monitoring.poll_runs WHERE device_id = d.id AND kind = 'poll' ORDER BY started_at DESC LIMIT 1
     ) pr ON true
     WHERE NOT d.disabled
     ORDER BY (pr.failed_items > 0) DESC NULLS LAST, completeness_percent ASC NULLS FIRST
     LIMIT $1 OFFSET $2`,
    [p.perPage, p.offset]
  )
  const totals = await db.query(
    `SELECT
       count(*) FILTER (WHERE NOT disabled)::int AS total_devices,
       count(*) FILTER (WHERE NOT disabled AND last_polled_at IS NULL)::int AS never_polled,
       count(*) FILTER (WHERE NOT disabled AND last_polled_at < now() - make_interval(secs => COALESCE(poll_interval_seconds,300)*3))::int AS stale
     FROM monitoring.devices`
  )
  const runAgg = await db.query(
    `SELECT
       count(*) FILTER (WHERE status = 'complete')::int AS complete_runs,
       count(*) FILTER (WHERE status = 'incomplete')::int AS incomplete_runs
     FROM (SELECT DISTINCT ON (device_id) status FROM monitoring.poll_runs WHERE kind = 'poll' ORDER BY device_id, started_at DESC) x`
  )

  return { ...listEnvelope(rows.rows, Number(totals.rows[0].total_devices), p), summary: { ...totals.rows[0], ...runAgg.rows[0] } }
})
