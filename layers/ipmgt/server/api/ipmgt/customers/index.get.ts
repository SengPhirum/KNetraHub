import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List customers with counts of what's assigned to each.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT cust.*,
      (SELECT count(*)::int FROM ipmgt_subnets s WHERE s.customer_id = cust.id) AS subnet_count,
      (SELECT count(*)::int FROM ipmgt_vlans v WHERE v.customer_id = cust.id) AS vlan_count,
      (SELECT count(*)::int FROM ipmgt_vrfs r WHERE r.customer_id = cust.id) AS vrf_count,
      (SELECT count(*)::int FROM ipmgt_ips a WHERE a.customer_id = cust.id) AS address_count,
      (SELECT count(*)::int FROM ipmgt_devices d WHERE d.customer_id = cust.id) AS device_count
    FROM ipmgt_customers cust ORDER BY cust.name ASC
  `)
  return rows
})
