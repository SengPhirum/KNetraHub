import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// List IP requests, optionally filtered by status/subnet_id, or narrowed to
// the caller's own requests (?mine=true - useful for a non-manager operator
// checking on what they've submitted).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  if (q.status) { params.push(q.status); where.push(`r.status = $${params.length}`) }
  if (q.subnet_id) { params.push(q.subnet_id); where.push(`r.subnet_id = $${params.length}`) }
  if (q.mine === 'true') { params.push(user.username); where.push(`r.requester = $${params.length}`) }

  const { rows } = await getDb().query(
    `SELECT r.*, sub.name AS subnet_name, sub.network AS subnet_network
     FROM ipmgt_requests r
     LEFT JOIN ipmgt_subnets sub ON sub.id = r.subnet_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY r.created_at DESC`,
    params
  )
  return rows
})
