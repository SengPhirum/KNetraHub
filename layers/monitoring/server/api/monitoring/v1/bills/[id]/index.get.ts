import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/bills/:id — bill with ports + recent periods. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)

  const bill = await db.query(`SELECT * FROM monitoring.bills WHERE id = $1`, [id])
  if (!bill.rows.length) notFound('bill')

  const ports = await db.query(
    `SELECT p.id, p.if_name, p.if_alias, p.if_index, p.speed_bps, d.id AS device_id, d.hostname
     FROM monitoring.bill_ports bp
     JOIN monitoring.ports p ON p.id = bp.port_id
     JOIN monitoring.devices d ON d.id = p.device_id
     WHERE bp.bill_id = $1 ORDER BY d.hostname, p.if_index`,
    [id]
  )
  const history = await db.query(
    `SELECT * FROM monitoring.bill_history WHERE bill_id = $1 ORDER BY period_start DESC LIMIT 24`,
    [id]
  )
  return { bill: bill.rows[0], ports: ports.rows, history: history.rows }
})
