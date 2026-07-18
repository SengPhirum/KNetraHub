import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../utils/monApi'
import { stripCredentials } from '../../../../../core/credentials'

/** GET /api/monitoring/v1/devices/:id — full device detail (no secrets). */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)

  const res = await db.query(
    `SELECT d.*, host(d.ip) AS ip_text, l.name AS location_name, cp.name AS credential_profile_name
     FROM monitoring.devices d
     LEFT JOIN monitoring.locations l ON l.id = d.location_id
     LEFT JOIN monitoring.credential_profiles cp ON cp.id = d.credential_profile_id
     WHERE d.id = $1`,
    [id]
  )
  if (!res.rows.length) notFound('device')
  const device = res.rows[0]

  const counts = await db.query(
    `SELECT
       (SELECT count(*)::int FROM monitoring.ports WHERE device_id = $1 AND stale_since IS NULL) AS ports,
       (SELECT count(*)::int FROM monitoring.sensors WHERE device_id = $1 AND stale_since IS NULL) AS sensors,
       (SELECT count(*)::int FROM monitoring.processors WHERE device_id = $1 AND stale_since IS NULL) AS processors,
       (SELECT count(*)::int FROM monitoring.mempools WHERE device_id = $1 AND stale_since IS NULL) AS mempools,
       (SELECT count(*)::int FROM monitoring.storage WHERE device_id = $1 AND stale_since IS NULL) AS storage,
       (SELECT count(*)::int FROM monitoring.services WHERE device_id = $1) AS services,
       (SELECT count(*)::int FROM monitoring.alerts WHERE device_id = $1 AND state IN ('open','acknowledged')) AS active_alerts`,
    [id]
  )

  const availability = await db.query(
    `SELECT duration, availability_percent FROM monitoring.device_availability WHERE device_id = $1`,
    [id]
  )
  const lastRun = await db.query(
    `SELECT status, planned_items, succeeded_items, unsupported_items, failed_items, finished_at
     FROM monitoring.poll_runs WHERE device_id = $1 AND kind = 'poll' ORDER BY started_at DESC LIMIT 1`,
    [id]
  )

  return {
    device: {
      ...stripCredentials(device),
      ip: device.ip_text,
      device_type_effective: device.device_type_override || device.device_type || 'server'
    },
    counts: counts.rows[0],
    availability: Object.fromEntries(availability.rows.map((r: any) => [r.duration, Number(r.availability_percent)])),
    last_poll: lastRun.rows[0] ?? null
  }
})
