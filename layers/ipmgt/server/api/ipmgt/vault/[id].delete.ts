import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vault_items WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Vault item not found' })
  await db.query('DELETE FROM ipmgt_vault_items WHERE id = $1', [id])
  await db.query('DELETE FROM ipmgt_vault_access_log WHERE vault_item_id = $1', [id])
  await ipamAudit(user, 'ipmgt.vault.delete', id, { name: cur.rows[0].name })
  return { deleted: 1 }
})
