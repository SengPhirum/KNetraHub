import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Threaded comments for a task, with reactions, oldest first. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId)
  const db = getWork()

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500)
  const before = q.before ? String(q.before) : null

  const params: unknown[] = [taskId]
  let where = 'c.task_id = $1 AND c.deleted_at IS NULL'
  if (before) { params.push(before); where += ` AND c.created_at < $${params.length}` }

  const { rows: comments } = await db.query(
    `SELECT c.id, c.parent_id, c.author, c.body, c.assigned_to, c.resolved_at, c.resolved_by, c.created_at, c.edited_at
       FROM work.comments c WHERE ${where}
      ORDER BY c.created_at DESC LIMIT ${limit + 1}`, params)
  const hasMore = comments.length > limit
  const page = (hasMore ? comments.slice(0, limit) : comments).reverse()

  const ids = page.map((c) => c.id)
  const reactions = ids.length
    ? (await db.query(
        'SELECT comment_id, emoji, username FROM work.comment_reactions WHERE comment_id = ANY($1) ORDER BY created_at', [ids])).rows
    : []
  const byComment = new Map<string, any[]>()
  for (const r of reactions) {
    const bucket = byComment.get(r.comment_id) || []
    bucket.push({ emoji: r.emoji, username: r.username })
    byComment.set(r.comment_id, bucket)
  }
  return {
    items: page.map((c) => ({ ...c, reactions: byComment.get(c.id) || [] })),
    hasMore,
    nextBefore: hasMore && page.length ? page[0].created_at : null
  }
})
