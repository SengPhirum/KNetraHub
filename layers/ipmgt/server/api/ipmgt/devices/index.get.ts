import { getDb } from '~~/server/utils/db'
import { requireIpam, stripDeviceSnmpSecrets } from '~~/layers/ipmgt/server/utils/ipamStore'

// List devices (optionally filtered) with joined location/customer names.
// Filters: device_type, status, location_id, customer_id, q (hostname/vendor/model/serial/asset/mgmt-ip search).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []

  if (q.device_type) { params.push(q.device_type); where.push(`dev.device_type = $${params.length}`) }
  if (q.status) { params.push(q.status); where.push(`dev.status = $${params.length}`) }
  if (q.location_id) { params.push(q.location_id); where.push(`dev.location_id = $${params.length}`) }
  if (q.customer_id) { params.push(q.customer_id); where.push(`dev.customer_id = $${params.length}`) }
  if (q.q) {
    params.push(`%${String(q.q).toLowerCase()}%`)
    const i = params.length
    where.push(`(lower(dev.hostname) LIKE $${i} OR lower(coalesce(dev.display_name,'')) LIKE $${i} OR lower(coalesce(dev.vendor,'')) LIKE $${i}
      OR lower(coalesce(dev.model,'')) LIKE $${i} OR lower(coalesce(dev.serial_number,'')) LIKE $${i}
      OR lower(coalesce(dev.asset_number,'')) LIKE $${i} OR lower(coalesce(dev.management_ip,'')) LIKE $${i})`)
  }

  const { rows } = await getDb().query(
    `SELECT dev.*, loc.name AS location_name, cust.name AS customer_name
     FROM ipmgt_devices dev
     LEFT JOIN ipmgt_locations loc ON loc.id = dev.location_id
     LEFT JOIN ipmgt_customers cust ON cust.id = dev.customer_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY dev.hostname ASC`,
    params
  )
  return rows.map(stripDeviceSnmpSecrets)
})
