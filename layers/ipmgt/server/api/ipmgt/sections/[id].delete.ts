import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, deleteCustomFieldValues } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

// Delete a section. Blocked when it still holds subnets unless ?force=true, in
// which case those subnets are detached (section_id set null), not destroyed.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')
  const force = getQuery(event).force === 'true'
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_sections WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const cnt = await db.query('SELECT count(*)::int AS c FROM ipmgt_subnets WHERE section_id = $1', [id])
  if (Number(cnt.rows[0].c) > 0 && !force) {
    throw createError({
      statusCode: 409,
      statusMessage: `Section has ${cnt.rows[0].c} subnet(s). Move them or use force delete.`
    })
  }
  if (force) await db.query('UPDATE ipmgt_subnets SET section_id = NULL WHERE section_id = $1', [id])

  await db.query('DELETE FROM ipmgt_sections WHERE id = $1', [id])
  await deleteCustomFieldValues('section', id!)
  await ipamAudit(user, 'ipmgt.section.delete', id!, { name: cur.rows[0].name, force })
  return { deleted: 1 }
})
