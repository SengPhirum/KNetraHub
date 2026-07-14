import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete a rack. Placed items cascade (FK ON DELETE CASCADE) - step-up
// confirmed since that silently discards the whole elevation.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_racks WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack not found' })
  const itemCount = await db.query('SELECT count(*)::int AS c FROM ipmgt_rack_items WHERE rack_id = $1', [id])

  await db.query('DELETE FROM ipmgt_racks WHERE id = $1', [id])
  await ipamAudit(user, 'ipmgt.rack.delete', id, { name: cur.rows[0].name, itemsRemoved: Number(itemCount.rows[0].c) })
  return { deleted: 1 }
})
