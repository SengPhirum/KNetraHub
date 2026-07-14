import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { checkDnsConsistency } from '~~/layers/ipmgt/server/utils/ipamDns'

// DNS consistency checker: addresses with a hostname whose recorded PTR
// doesn't match the PTR name the IP actually resolves to (or is missing
// one), skipping anything marked ptr-ignored. Optional ?subnet_id= filter.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where = q.subnet_id ? 'WHERE subnet_id = $1' : ''
  const params = q.subnet_id ? [q.subnet_id] : []
  const { rows } = await getDb().query(
    `SELECT id, ip, hostname, ptr, subnet_id FROM ipmgt_ips ${where}`,
    params
  )
  const issues = checkDnsConsistency(rows)
  return { checked: rows.length, issues }
})
