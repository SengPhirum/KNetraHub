import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb } from '../../../../utils/monApi'
import { syslogStats } from '../../../../receivers/syslog'

/** GET /api/monitoring/v1/system/status — overview counters for the dashboard. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()

  const devices = await db.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status = 'up')::int AS up,
       count(*) FILTER (WHERE status = 'down')::int AS down,
       count(*) FILTER (WHERE status = 'degraded')::int AS degraded,
       count(*) FILTER (WHERE status = 'disabled' OR disabled)::int AS disabled,
       count(*) FILTER (WHERE status = 'maintenance')::int AS maintenance,
       count(*) FILTER (WHERE status = 'pending')::int AS pending
     FROM monitoring.devices`
  )
  const alerts = await db.query(
    `SELECT
       count(*) FILTER (WHERE state IN ('open','acknowledged'))::int AS active,
       count(*) FILTER (WHERE state = 'open' AND severity = 'critical')::int AS critical,
       count(*) FILTER (WHERE state = 'open' AND severity = 'warning')::int AS warning,
       count(*) FILTER (WHERE state = 'acknowledged')::int AS acknowledged
     FROM monitoring.alerts`
  )
  const entities = await db.query(
    `SELECT
       (SELECT count(*)::int FROM monitoring.ports WHERE stale_since IS NULL) AS ports,
       (SELECT count(*)::int FROM monitoring.sensors WHERE stale_since IS NULL) AS sensors,
       (SELECT count(*)::int FROM monitoring.services) AS services`
  )
  const pollers = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE last_heartbeat_at > now() - interval '30 seconds')::int AS healthy
     FROM monitoring.poller_nodes`
  )
  const lastTrap = await db.query(`SELECT max(received_at) AS at FROM monitoring.traps`)

  return {
    devices: devices.rows[0],
    alerts: alerts.rows[0],
    entities: entities.rows[0],
    pollers: pollers.rows[0],
    receivers: {
      last_trap_at: lastTrap.rows[0].at,
      syslog: syslogStats
    }
  }
})
