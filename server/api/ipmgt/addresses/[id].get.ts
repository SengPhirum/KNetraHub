import { getDb } from '../../../utils/db'
import { requireIpam } from '../../../utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')
  const { rows } = await getDb().query(
    `SELECT a.*, sub.name AS subnet_name, sub.network AS subnet_network
     FROM ipmgt_ips a LEFT JOIN ipmgt_subnets sub ON sub.id = a.subnet_id
     WHERE a.id = $1`,
    [id]
  )
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  const r = rows[0]
  return { ...r, status: r.status || String(r.state || 'used').toLowerCase() }
})
