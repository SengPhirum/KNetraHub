import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_circuits WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Circuit not found' })
  await db.query('DELETE FROM ipmgt_circuits WHERE id = $1', [id])
  await ipamAudit(user, 'ipmgt.circuit.delete', id, { circuit_ref: cur.rows[0].circuit_ref })
  return { deleted: 1 }
})
