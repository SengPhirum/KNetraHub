import { getWork, newId, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Add an item (optionally nested one level) to a checklist. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const checklistId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.checklists WHERE id = $1', [checklistId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Checklist not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  const body = await readBody(event)

  let parentItemId: string | null = null
  if (body?.parent_item_id) {
    const parent = await db.query(
      'SELECT id, parent_item_id FROM work.checklist_items WHERE id = $1 AND checklist_id = $2', [String(body.parent_item_id), checklistId])
    if (!parent.rows.length) throw createError({ statusCode: 404, statusMessage: 'Parent item not found' })
    if (parent.rows[0].parent_item_id) throw createError({ statusCode: 400, statusMessage: 'Checklist items nest one level deep' })
    parentItemId = parent.rows[0].id
  }

  const assignee = body?.assignee ? String(body.assignee).trim().toLowerCase() : null
  const id = newId()
  await db.query(
    'INSERT INTO work.checklist_items (id, checklist_id, parent_item_id, name, assignee, order_index, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, checklistId, parentItemId, requireText(body?.name, 'Item name', 500), assignee, Date.now(), user.username])
  return { id }
})
