import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'

// Delete a VRF. Subnets referencing it are detached (vrf_id set null).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vrfs WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'VRF not found' })
  await db.query('UPDATE ipmgt_subnets SET vrf_id = NULL WHERE vrf_id = $1', [id])
  await db.query('DELETE FROM ipmgt_vrfs WHERE id = $1', [id])
  await deleteCustomFieldValues('vrf', id)
  await ipamAudit(user, 'ipmgt.vrf.delete', id, { name: cur.rows[0].name })
  return { deleted: 1 }
})
