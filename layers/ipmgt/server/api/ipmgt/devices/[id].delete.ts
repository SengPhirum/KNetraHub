import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, usedByRows, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete a device. Blocked (409, with the referencing addresses named) if any
// IP address still points at it - detach those first.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_devices WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Device not found' })

  const users = await usedByRows(id, [
    { table: 'ipmgt_ips', col: 'device_id', type: 'address', nameCol: 'ip' }
  ])
  if (users.length) {
    const list = users.map((u) => `${u.type} "${u.name}"`).join(', ')
    throw createError({
      statusCode: 409,
      statusMessage: `Device "${cur.rows[0].hostname}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  await db.query('DELETE FROM ipmgt_devices WHERE id = $1', [id])
  await deleteCustomFieldValues('device', id)
  await ipamAudit(user, 'ipmgt.device.delete', id, { hostname: cur.rows[0].hostname })
  return { deleted: 1 }
})
