import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  if (q.status) { params.push(q.status); where.push(`c.status = $${params.length}`) }
  if (q.customer_id) { params.push(q.customer_id); where.push(`c.customer_id = $${params.length}`) }

  const { rows } = await getDb().query(
    `SELECT c.*, p.name AS provider_name, cust.name AS customer_name,
       la.name AS endpoint_a_location_name, lb.name AS endpoint_b_location_name,
       da.hostname AS endpoint_a_device_hostname, db2.hostname AS endpoint_b_device_hostname
     FROM ipmgt_circuits c
     LEFT JOIN ipmgt_circuit_providers p ON p.id = c.provider_id
     LEFT JOIN ipmgt_customers cust ON cust.id = c.customer_id
     LEFT JOIN ipmgt_locations la ON la.id = c.endpoint_a_location_id
     LEFT JOIN ipmgt_locations lb ON lb.id = c.endpoint_b_location_id
     LEFT JOIN ipmgt_devices da ON da.id = c.endpoint_a_device_id
     LEFT JOIN ipmgt_devices db2 ON db2.id = c.endpoint_b_device_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.circuit_ref ASC`,
    params
  )
  return rows
})
