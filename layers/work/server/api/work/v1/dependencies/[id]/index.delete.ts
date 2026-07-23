import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Remove a dependency edge. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const depId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.task_dependencies WHERE id = $1 AND workspace_id = $2', [depId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Dependency not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].successor_id, 'edit')
  await db.query('DELETE FROM work.task_dependencies WHERE id = $1', [depId])
  return { deleted: true }
})
