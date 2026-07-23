import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'

/** Delete a time entry (own entries; managers may correct anyone's). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.time')
  const entryId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.time_entries WHERE id = $1 AND workspace_id = $2', [entryId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Time entry not found' })
  const isManager = tier === 'manager' || tier === 'admin'
  if (rows[0].username.toLowerCase() !== user.username.toLowerCase() && !isManager) {
    throw createError({ statusCode: 403, statusMessage: 'Only the owner or a manager can delete this entry' })
  }
  await db.query('DELETE FROM work.time_entries WHERE id = $1', [entryId])
  return { deleted: true }
})
