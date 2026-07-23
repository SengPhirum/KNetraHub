import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Delete a tag (detaches it from all tasks). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const tagId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.tags WHERE id = $1 AND workspace_id = $2', [tagId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  await assertSpaceAccess(user, tier, workspaceId, rows[0].space_id, 'edit')
  await db.query('DELETE FROM work.tags WHERE id = $1', [tagId])
  return { deleted: true }
})
