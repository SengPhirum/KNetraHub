import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Delete a checklist and its items. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const checklistId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.checklists WHERE id = $1', [checklistId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Checklist not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  await db.query('DELETE FROM work.checklists WHERE id = $1', [checklistId])
  return { deleted: true }
})
