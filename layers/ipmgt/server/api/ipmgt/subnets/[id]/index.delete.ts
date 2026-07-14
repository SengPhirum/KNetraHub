import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, loadSubnet, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete (truncate) a subnet. Blocked when it holds addresses or child subnets
// unless ?force=true. Addresses cascade via FK; children are detached.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  const force = getQuery(event).force === 'true'
  const db = getDb()

  const ipRows = await db.query('SELECT id FROM ipmgt_ips WHERE subnet_id = $1', [id])
  const childCnt = await db.query('SELECT count(*)::int AS c FROM ipmgt_subnets WHERE parent_id = $1', [id])
  if ((ipRows.rows.length > 0 || Number(childCnt.rows[0].c) > 0) && !force) {
    throw createError({
      statusCode: 409,
      statusMessage: `Subnet has ${ipRows.rows.length} address(es) and ${childCnt.rows[0].c} child subnet(s). Use force delete.`
    })
  }
  await db.query('UPDATE ipmgt_subnets SET parent_id = NULL WHERE parent_id = $1', [id])
  await db.query('DELETE FROM ipmgt_subnets WHERE id = $1', [id]) // ipmgt_ips cascade via FK
  await deleteCustomFieldValues('subnet', id)
  for (const ip of ipRows.rows) await deleteCustomFieldValues('address', ip.id)
  await ipamAudit(user, 'ipmgt.subnet.delete', id, { network: subnet.network, force })
  return { deleted: 1 }
})
