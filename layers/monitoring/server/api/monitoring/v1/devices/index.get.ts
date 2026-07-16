import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, listParams, listEnvelope } from '../../../../utils/monApi'

const SORTABLE = ['hostname', 'display_name', 'status', 'os', 'last_polled_at', 'created_at']

/** GET /api/monitoring/v1/devices — paginated, filterable device list. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const p = listParams(event, SORTABLE, 'hostname')
  const query = getQuery(event)

  const where: string[] = []
  const args: unknown[] = []
  // add() pushes a value, then substitutes a single `?` placeholder in the
  // fragment with its positional parameter ($N).
  const add = (sqlTemplate: string, value: unknown) => {
    args.push(value)
    where.push(sqlTemplate.replaceAll('?', `$${args.length}`))
  }

  if (p.q) add(`(d.hostname ILIKE ? OR d.display_name ILIKE ? OR host(d.ip) ILIKE ? OR d.sys_name ILIKE ?)`, `%${p.q}%`)
  if (query.status) add(`d.status = ?`, String(query.status))
  if (query.os) add(`d.os = ?`, String(query.os))
  if (query.location_id) add(`d.location_id = ?`, Number(query.location_id))
  if (query.poller_group != null) add(`d.poller_group = ?`, Number(query.poller_group))
  if (query.group_id) add(`d.id IN (SELECT device_id FROM monitoring.device_group_members WHERE group_id = ?)`, Number(query.group_id))

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql = p.sort ? `ORDER BY d.${p.sort} ${p.order} NULLS LAST` : 'ORDER BY d.hostname ASC'

  const totalRes = await db.query(`SELECT count(*)::int AS c FROM monitoring.devices d ${whereSql}`, args)
  const rows = await db.query(
    `SELECT d.id, d.hostname, d.display_name, host(d.ip) AS ip, d.os, d.os_version, d.hardware, d.vendor,
            d.serial, d.status, d.status_reason, d.icmp_status, d.snmp_status, d.snmp_disabled,
            d.uptime_seconds, d.last_ping_ms, d.poller_group, d.disabled, d.ignored,
            d.last_polled_at, d.last_discovered_at, d.sys_name,
            l.name AS location,
            (SELECT count(*)::int FROM monitoring.ports WHERE device_id = d.id AND stale_since IS NULL) AS port_count,
            (SELECT count(*)::int FROM monitoring.sensors WHERE device_id = d.id AND stale_since IS NULL) AS sensor_count,
            (SELECT count(*)::int FROM monitoring.alerts WHERE device_id = d.id AND state IN ('open','acknowledged')) AS active_alerts
     FROM monitoring.devices d
     LEFT JOIN monitoring.locations l ON l.id = d.location_id
     ${whereSql} ${orderSql} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, p.perPage, p.offset]
  )
  return listEnvelope(rows.rows, Number(totalRes.rows[0].c), p)
})
