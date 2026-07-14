import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'manager')
  const id = getRouterParam(event, 'id')!
  const { rows } = await getDb().query(
    'SELECT actor, action, accessed_at FROM ipmgt_vault_access_log WHERE vault_item_id = $1 ORDER BY accessed_at DESC LIMIT 50',
    [id]
  )
  return rows
})
