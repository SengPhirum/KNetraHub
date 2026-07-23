import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Toggle an emoji reaction on a comment. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.comment')
  const commentId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT task_id FROM work.comments WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL', [commentId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  await assertTaskAccess(user, tier, workspaceId, rows[0].task_id, 'comment')

  const body = await readBody(event)
  const emoji = String(body?.emoji || '').trim()
  // Short unicode emoji only — no markup, no long strings.
  if (!emoji || emoji.length > 8) throw createError({ statusCode: 400, statusMessage: 'A short emoji is required' })

  const me = user.username.toLowerCase()
  const existing = await db.query(
    'SELECT 1 FROM work.comment_reactions WHERE comment_id = $1 AND emoji = $2 AND username = $3', [commentId, emoji, me])
  if (existing.rows.length) {
    await db.query('DELETE FROM work.comment_reactions WHERE comment_id = $1 AND emoji = $2 AND username = $3', [commentId, emoji, me])
    return { reacted: false }
  }
  await db.query('INSERT INTO work.comment_reactions (comment_id, emoji, username) VALUES ($1,$2,$3)', [commentId, emoji, me])
  return { reacted: true }
})
