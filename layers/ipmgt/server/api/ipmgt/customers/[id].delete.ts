import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, usedByRows, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete a customer. Blocked (409, with the referencing records named) if any
// subnet/VLAN/VRF/address/device still points at it - detach those first.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_customers WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })

  const users = await usedByRows(id, [
    { table: 'ipmgt_subnets', col: 'customer_id', type: 'subnet', nameCol: 'network' },
    { table: 'ipmgt_vlans', col: 'customer_id', type: 'vlan', nameCol: 'name' },
    { table: 'ipmgt_vrfs', col: 'customer_id', type: 'vrf', nameCol: 'name' },
    { table: 'ipmgt_ips', col: 'customer_id', type: 'address', nameCol: 'ip' },
    { table: 'ipmgt_devices', col: 'customer_id', type: 'device', nameCol: 'hostname' }
  ])
  if (users.length) {
    const list = users.map((u) => `${u.type} "${u.name}"`).join(', ')
    throw createError({
      statusCode: 409,
      statusMessage: `Customer "${cur.rows[0].name}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  await db.query('DELETE FROM ipmgt_customers WHERE id = $1', [id])
  await deleteCustomFieldValues('customer', id)
  await ipamAudit(user, 'ipmgt.customer.delete', id, { name: cur.rows[0].name })
  return { deleted: 1 }
})
