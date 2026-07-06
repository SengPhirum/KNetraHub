import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// Timeline of changes for one address (IP detail "History" tab).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')
  const { rows } = await getDb().query(
    'SELECT * FROM ipmgt_ip_history WHERE ip_id = $1 ORDER BY changed_at DESC LIMIT 200',
    [id]
  )
  return rows
})
