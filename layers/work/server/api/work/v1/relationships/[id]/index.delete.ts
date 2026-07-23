import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Unlink two tasks. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const relId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.task_relationships WHERE id = $1 AND workspace_id = $2', [relId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Relationship not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'edit')
  await db.query('DELETE FROM work.task_relationships WHERE id = $1', [relId])
  return { deleted: true }
})
