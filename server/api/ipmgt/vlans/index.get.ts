import { getDb } from '../../../utils/db'
import { requireIpam } from '../../../utils/ipamStore'

// List VLANs with their L2 domain name and count of attached subnets.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT v.*, d.name AS l2domain_name,
      (SELECT count(*)::int FROM ipmgt_subnets s WHERE s.vlan_ref = v.id) AS subnet_count
    FROM ipmgt_vlans v
    LEFT JOIN ipmgt_l2domains d ON d.id = v.l2domain_id
    ORDER BY v.vlan_id ASC
  `)
  return rows
})
