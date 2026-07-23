import { getWork, newId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Link two tasks (free-form relationship, no ordering semantics). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const body = await readBody(event)
  const relatedId = String(body?.task_id || '')
  if (!relatedId || relatedId === taskId) throw createError({ statusCode: 400, statusMessage: 'A different task_id is required' })
  await assertTaskAccess(user, tier, workspaceId, relatedId, 'view')
  const db = getWork()
  const dup = await db.query(
    `SELECT id FROM work.task_relationships
      WHERE (task_id = $1 AND related_task_id = $2) OR (task_id = $2 AND related_task_id = $1)`, [taskId, relatedId])
  if (dup.rows.length) return { id: dup.rows[0].id, existing: true }
  const id = newId()
  await db.query(
    'INSERT INTO work.task_relationships (id, workspace_id, task_id, related_task_id, created_by) VALUES ($1,$2,$3,$4,$5)',
    [id, workspaceId, taskId, relatedId, user.username])
  return { id }
})
