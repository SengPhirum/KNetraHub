import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List VRFs with the count of subnets that belong to each.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT vrf.*, loc.name AS location_name, cust.name AS customer_name,
      (SELECT count(*)::int FROM ipmgt_subnets s WHERE s.vrf_id = vrf.id) AS subnet_count
    FROM ipmgt_vrfs vrf
    LEFT JOIN ipmgt_locations loc ON loc.id = vrf.location_id
    LEFT JOIN ipmgt_customers cust ON cust.id = vrf.customer_id
    ORDER BY vrf.name ASC
  `)
  return rows
})
