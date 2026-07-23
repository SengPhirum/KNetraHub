import { getWork, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Rename/reorder a checklist. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const checklistId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.checklists WHERE id = $1', [checklistId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Checklist not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  const body = await readBody(event)
  await db.query(
    'UPDATE work.checklists SET name = $2, order_index = $3 WHERE id = $1',
    [checklistId,
      body?.name !== undefined ? requireText(body.name, 'Checklist name', 120) : rows[0].name,
      body?.order_index !== undefined && Number.isFinite(Number(body.order_index)) ? Number(body.order_index) : rows[0].order_index])
  return { id: checklistId }
})
