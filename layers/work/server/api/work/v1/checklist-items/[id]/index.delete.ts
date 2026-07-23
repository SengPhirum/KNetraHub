import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Delete a checklist item (and its nested items). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const itemId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query(
    `SELECT i.id, c.task_id FROM work.checklist_items i JOIN work.checklists c ON c.id = i.checklist_id WHERE i.id = $1`, [itemId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Checklist item not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  await db.query('DELETE FROM work.checklist_items WHERE id = $1', [itemId])
  return { deleted: true }
})
