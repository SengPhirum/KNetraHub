import { getWork, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Edit a comment. Authors edit their own body; assigned comments can be
 * resolved/reopened by the assignee, the author, or a manager.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.comment')
  const commentId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.comments WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL', [commentId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  const comment = rows[0]
  await assertTaskAccess(user, tier, workspaceId, comment.task_id, 'comment')
  const body = await readBody(event)
  const me = user.username.toLowerCase()
  const isManager = tier === 'manager' || tier === 'admin'

  if (body?.body !== undefined) {
    if (comment.author.toLowerCase() !== me) {
      throw createError({ statusCode: 403, statusMessage: 'Only the author can edit a comment' })
    }
    const text = requireText(body.body, 'Comment', 20_000)
    await db.query('UPDATE work.comments SET body = $2, edited_at = now() WHERE id = $1', [commentId, text])
  }
  if (body?.resolved !== undefined) {
    const mayResolve = isManager || comment.author.toLowerCase() === me || (comment.assigned_to || '').toLowerCase() === me
    if (!mayResolve) throw createError({ statusCode: 403, statusMessage: 'Only the author, assignee, or a manager can resolve this comment' })
    if (body.resolved) {
      await db.query('UPDATE work.comments SET resolved_at = now(), resolved_by = $2 WHERE id = $1', [commentId, user.username])
    } else {
      await db.query('UPDATE work.comments SET resolved_at = NULL, resolved_by = NULL WHERE id = $1', [commentId])
    }
  }
  return { id: commentId }
})
