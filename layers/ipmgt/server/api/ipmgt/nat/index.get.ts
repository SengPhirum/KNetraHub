import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT n.*, ip.ip AS source_ip_address, sub.network AS source_subnet_network,
      dev.hostname AS device_hostname, cust.name AS customer_name
    FROM ipmgt_nat_rules n
    LEFT JOIN ipmgt_ips ip ON ip.id = n.source_ip_id
    LEFT JOIN ipmgt_subnets sub ON sub.id = n.source_subnet_id
    LEFT JOIN ipmgt_devices dev ON dev.id = n.device_id
    LEFT JOIN ipmgt_customers cust ON cust.id = n.customer_id
    ORDER BY n.created_at DESC
  `)
  return rows
})
