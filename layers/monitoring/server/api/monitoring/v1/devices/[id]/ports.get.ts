import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/devices/:id/ports — every discovered interface + latest rates. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const rows = await db.query(
    `SELECT p.id, p.if_index, p.if_name, p.if_descr, p.if_alias, p.if_type, p.mac_address, p.mtu,
            p.speed_bps, p.duplex, p.admin_status, p.oper_status, p.last_change_at,
            p.disabled, p.ignored, p.stale_since,
            m.in_bps, m.out_bps, m.in_util_percent, m.out_util_percent,
            m.in_errors_ps, m.out_errors_ps, m.in_discards_ps, m.out_discards_ps
     FROM monitoring.ports p
     LEFT JOIN LATERAL (
       SELECT * FROM monitoring.port_metrics WHERE port_id = p.id ORDER BY time DESC LIMIT 1
     ) m ON true
     WHERE p.device_id = $1
     ORDER BY p.if_index`,
    [id]
  )
  return { items: rows.rows, total: rows.rows.length }
})
