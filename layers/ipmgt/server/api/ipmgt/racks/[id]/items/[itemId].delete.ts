import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const rackId = getRouterParam(event, 'id')!
  const itemId = getRouterParam(event, 'itemId')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_rack_items WHERE id = $1 AND rack_id = $2', [itemId, rackId])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack item not found' })

  await db.query('DELETE FROM ipmgt_rack_items WHERE id = $1', [itemId])
  await ipamAudit(user, 'ipmgt.rack.item.delete', itemId, { name: cur.rows[0].name })
  return { deleted: 1 }
})
