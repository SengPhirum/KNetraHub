import { getDb } from '../../../utils/db'
import { requireIpam, ipamAudit, recordIpHistory } from '../../../utils/ipamStore'

// Release/delete an address (frees it — free addresses are not stored).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_ips WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  const row = cur.rows[0]

  await db.query('DELETE FROM ipmgt_ips WHERE id = $1', [id])
  // Keep the history row but null the ip_id link (record survives the delete).
  await db.query('UPDATE ipmgt_ip_history SET ip_id = NULL WHERE ip_id = $1', [id])
  await recordIpHistory({ ipId: null, subnetId: row.subnet_id, ip: row.ip, action: 'released', actor: user.username })
  await ipamAudit(user, 'ipmgt.ip.release', id, { ip: row.ip })
  return { deleted: 1 }
})
