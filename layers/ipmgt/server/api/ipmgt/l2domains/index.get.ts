import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT d.*, (SELECT count(*)::int FROM ipmgt_vlans v WHERE v.l2domain_id = d.id) AS vlan_count
    FROM ipmgt_l2domains d ORDER BY d.name ASC
  `)
  return rows
})
