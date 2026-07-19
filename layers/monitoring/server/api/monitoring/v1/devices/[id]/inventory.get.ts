import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam } from '../../../../../utils/monApi'

/**
 * GET /api/monitoring/v1/devices/:id/inventory
 * `hr` — HOST-RESOURCES hrDeviceTable rows (processors/network/disks…),
 *        network rows carry the matched port for linking + sparkline.
 * `items` — ENTITY-MIB physical inventory tree (chassis/modules/PSUs…).
 */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const [hr, ent] = await Promise.all([
    db.query(
      `SELECT h.id, h.hr_index, h.descr, h.hr_type, h.status, h.errors, h.load_percent,
              h.port_id, p.if_name AS port_name, p.if_descr AS port_descr, h.stale_since
       FROM monitoring.hr_devices h
       LEFT JOIN monitoring.ports p ON p.id = h.port_id
       WHERE h.device_id = $1 ORDER BY h.hr_index`,
      [id]
    ),
    db.query(
      `SELECT id, ent_physical_index, parent_index, name, descr, class, serial, model, manufacturer, hardware_rev, firmware_rev, software_rev, is_fru, stale_since FROM monitoring.inventory WHERE device_id = $1 ORDER BY ent_physical_index`,
      [id]
    )
  ])
  return { hr: hr.rows, items: ent.rows, total: hr.rows.length + ent.rows.length }
})
