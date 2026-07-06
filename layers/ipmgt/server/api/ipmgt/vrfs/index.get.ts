import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List VRFs with the count of subnets that belong to each.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT vrf.*,
      (SELECT count(*)::int FROM ipmgt_subnets s WHERE s.vrf_id = vrf.id) AS subnet_count
    FROM ipmgt_vrfs vrf ORDER BY vrf.name ASC
  `)
  return rows
})
