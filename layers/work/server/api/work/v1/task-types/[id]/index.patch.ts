import { getWork, optionalText, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'

/** Update a task type (admin: work.settings). */
export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireWorkPermission(event, 'work.settings')
  const typeId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.task_types WHERE id = $1 AND workspace_id = $2', [typeId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Task type not found' })
  const body = await readBody(event)

  const name = body?.name !== undefined ? requireText(body.name, 'Type name', 60) : rows[0].name
  if (name.toLowerCase() !== rows[0].name.toLowerCase()) {
    const dup = await db.query(
      'SELECT 1 FROM work.task_types WHERE workspace_id = $1 AND lower(name) = lower($2) AND id <> $3', [workspaceId, name, typeId])
    if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A task type named "${name}" already exists` })
  }
  await db.query(
    'UPDATE work.task_types SET name = $2, icon = $3, description = $4, order_index = $5 WHERE id = $1',
    [typeId, name,
      body?.icon !== undefined ? (optionalText(body.icon, 'Icon', 60) || 'i-lucide-circle-check') : rows[0].icon,
      body?.description !== undefined ? optionalText(body.description, 'Description', 500) : rows[0].description,
      body?.order_index !== undefined && Number.isFinite(Number(body.order_index)) ? Number(body.order_index) : rows[0].order_index])
  return { id: typeId }
})
