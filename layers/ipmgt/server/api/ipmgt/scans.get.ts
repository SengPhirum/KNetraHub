import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// Recent scan run history, optionally filtered to one subnet.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  if (q.subnet_id) { params.push(q.subnet_id); where.push(`h.subnet_id = $${params.length}`) }

  const limit = Math.min(Number(q.limit) || 100, 500)
  const { rows } = await getDb().query(
    `SELECT h.*, sub.name AS subnet_name, sub.network AS subnet_network
     FROM ipmgt_scan_history h
     LEFT JOIN ipmgt_subnets sub ON sub.id = h.subnet_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY h.started_at DESC
     LIMIT ${limit}`,
    params
  )
  return rows
})
