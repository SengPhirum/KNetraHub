import { getWork, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Update a checklist item (name, done, assignee, order). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const itemId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query(
    `SELECT i.*, c.task_id FROM work.checklist_items i JOIN work.checklists c ON c.id = i.checklist_id WHERE i.id = $1`, [itemId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Checklist item not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  const body = await readBody(event)
  await db.query(
    'UPDATE work.checklist_items SET name = $2, done = $3, assignee = $4, order_index = $5 WHERE id = $1',
    [itemId,
      body?.name !== undefined ? requireText(body.name, 'Item name', 500) : rows[0].name,
      body?.done !== undefined ? body.done === true : rows[0].done,
      body?.assignee !== undefined ? (body.assignee ? String(body.assignee).trim().toLowerCase() : null) : rows[0].assignee,
      body?.order_index !== undefined && Number.isFinite(Number(body.order_index)) ? Number(body.order_index) : rows[0].order_index])
  return { id: itemId }
})
