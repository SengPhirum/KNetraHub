import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'

// Delete a custom field definition. Cascades to its stored values (FK ON
// DELETE CASCADE) - name-confirmed since this is a real, silent data loss.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_custom_field_defs WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Custom field not found' })
  await requireDeleteConfirm(event, 'ipmgt.customfield', { name: cur.rows[0].label })

  const valueCount = await db.query('SELECT count(*)::int AS c FROM ipmgt_custom_field_values WHERE field_id = $1', [id])
  await db.query('DELETE FROM ipmgt_custom_field_defs WHERE id = $1', [id])
  await ipamAudit(user, 'ipmgt.customfield.delete', id, { field_key: cur.rows[0].field_key, valuesDeleted: Number(valueCount.rows[0].c) })
  return { deleted: 1 }
})
