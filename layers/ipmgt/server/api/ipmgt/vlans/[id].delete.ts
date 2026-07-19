import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete a VLAN. Attached subnets have their vlan_ref detached, not deleted.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vlans WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'VLAN not found' })

  await db.query('UPDATE ipmgt_subnets SET vlan_ref = NULL WHERE vlan_ref = $1', [id])
  await db.query('DELETE FROM ipmgt_vlans WHERE id = $1', [id])
  await deleteCustomFieldValues('vlan', id)
  await ipamAudit(user, 'ipmgt.vlan.delete', id, { vlan_id: cur.rows[0].vlan_id })
  return { deleted: 1 }
})
