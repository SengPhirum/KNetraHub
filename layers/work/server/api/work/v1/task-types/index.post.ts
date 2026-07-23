import { getWork, newId, optionalText, requireText, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'

/** Create a custom task type (admin: work.settings). */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWorkPermission(event, 'work.settings')
  const body = await readBody(event)
  const name = requireText(body?.name, 'Type name', 60)
  const db = getWork()
  const dup = await db.query('SELECT 1 FROM work.task_types WHERE workspace_id = $1 AND lower(name) = lower($2)', [workspaceId, name])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A task type named "${name}" already exists` })
  const id = newId()
  await db.query(
    `INSERT INTO work.task_types (id, workspace_id, name, icon, description, order_index, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, workspaceId, name, optionalText(body?.icon, 'Icon', 60) || 'i-lucide-circle-check',
      optionalText(body?.description, 'Description', 500), Number(body?.order_index) || Date.now(), user.username])
  await workAudit(user, 'task_type.created', id, name)
  return { id }
})
