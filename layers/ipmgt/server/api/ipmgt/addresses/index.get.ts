import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List defined addresses with the owning subnet's name/CIDR. Filters:
// subnet_id, status, q (ip/hostname/mac/description/owner search).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []

  if (q.subnet_id) { params.push(q.subnet_id); where.push(`a.subnet_id = $${params.length}`) }
  if (q.status) { params.push(String(q.status).toLowerCase()); where.push(`lower(coalesce(a.status, a.state)) = $${params.length}`) }
  if (q.q) {
    params.push(`%${String(q.q).toLowerCase()}%`)
    const p = `$${params.length}`
    where.push(`(lower(a.ip) LIKE ${p} OR lower(coalesce(a.hostname,'')) LIKE ${p} OR lower(coalesce(a.mac,'')) LIKE ${p} OR lower(coalesce(a.description,'')) LIKE ${p} OR lower(coalesce(a.owner,'')) LIKE ${p})`)
  }

  const limit = Math.min(Number(q.limit) || 500, 5000)
  const { rows } = await getDb().query(
    `SELECT a.*, sub.name AS subnet_name, sub.network AS subnet_network,
       cust.name AS customer_name, dev.hostname AS device_hostname
     FROM ipmgt_ips a
     LEFT JOIN ipmgt_subnets sub ON sub.id = a.subnet_id
     LEFT JOIN ipmgt_customers cust ON cust.id = a.customer_id
     LEFT JOIN ipmgt_devices dev ON dev.id = a.device_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.subnet_id, a.ip ASC
     LIMIT ${limit}`,
    params
  )
  return rows.map((r: any) => ({ ...r, status: r.status || String(r.state || 'used').toLowerCase() }))
})
