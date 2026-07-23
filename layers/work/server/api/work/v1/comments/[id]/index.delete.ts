import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Soft-delete a comment (author or manager). Replies stay visible. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.comment')
  const commentId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.comments WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL', [commentId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'comment')
  const isManager = tier === 'manager' || tier === 'admin'
  if (rows[0].author.toLowerCase() !== user.username.toLowerCase() && !isManager) {
    throw createError({ statusCode: 403, statusMessage: 'Only the author or a manager can delete a comment' })
  }
  await db.query('UPDATE work.comments SET deleted_at = now() WHERE id = $1', [commentId])
  return { deleted: true }
})
