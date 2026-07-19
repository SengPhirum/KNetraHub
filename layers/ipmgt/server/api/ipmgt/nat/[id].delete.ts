import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_nat_rules WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'NAT rule not found' })
  await db.query('DELETE FROM ipmgt_nat_rules WHERE id = $1', [id])
  await ipamAudit(user, 'ipmgt.nat.delete', id, { translated_address: cur.rows[0].translated_address })
  return { deleted: 1 }
})
