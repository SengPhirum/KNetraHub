import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List locations with parent name and counts of what's assigned to each.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT loc.*, parent.name AS parent_name,
      (SELECT count(*)::int FROM ipmgt_subnets s WHERE s.location_id = loc.id) AS subnet_count,
      (SELECT count(*)::int FROM ipmgt_vlans v WHERE v.location_id = loc.id) AS vlan_count,
      (SELECT count(*)::int FROM ipmgt_vrfs r WHERE r.location_id = loc.id) AS vrf_count,
      (SELECT count(*)::int FROM ipmgt_devices d WHERE d.location_id = loc.id) AS device_count
    FROM ipmgt_locations loc
    LEFT JOIN ipmgt_locations parent ON parent.id = loc.parent_id
    ORDER BY loc.name ASC
  `)
  return rows
})
