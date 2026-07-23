import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'

/** Delete a saved view (owner; shared views also by managers). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const viewId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.views WHERE id = $1 AND workspace_id = $2', [viewId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'View not found' })
  const isManager = tier === 'manager' || tier === 'admin'
  const isOwner = rows[0].owner.toLowerCase() === user.username.toLowerCase()
  if (!isOwner && !(isManager && !rows[0].is_private)) {
    throw createError({ statusCode: 403, statusMessage: 'Only the owner (or a manager, for shared views) can delete this view' })
  }
  await db.query('DELETE FROM work.views WHERE id = $1', [viewId])
  return { deleted: true }
})
