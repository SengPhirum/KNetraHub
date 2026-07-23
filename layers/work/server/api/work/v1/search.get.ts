import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { visibleSpaceIds } from '~~/layers/work/server/utils/workAccess'
import { queryTasks } from '~~/layers/work/server/utils/workTasks'

/**
 * Permission-aware full-text search across tasks, comments, docs/pages, and
 * hierarchy names. Every branch filters by the caller's visible spaces BEFORE
 * matching, so counts and snippets never leak private content.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { tasks: [], comments: [], docs: [], locations: [] }
  if (q.length > 200) throw createError({ statusCode: 400, statusMessage: 'Search query too long' })
  const db = getWork()
  const spaceIds = await visibleSpaceIds(user, tier, workspaceId)
  const like = `%${q}%`

  const [tasks, comments, docs, spaces, lists, folders] = await Promise.all([
    queryTasks(user, tier, workspaceId, { q, limit: 25, includeArchived: false, excludeClosed: false }),
    spaceIds.length
      ? db.query(
          `SELECT c.id, c.task_id, c.author, left(c.body, 300) AS snippet, c.created_at, t.name AS task_name, t.custom_id
             FROM work.comments c JOIN work.tasks t ON t.id = c.task_id
            WHERE c.workspace_id = $1 AND c.deleted_at IS NULL AND t.deleted_at IS NULL AND t.space_id = ANY($2)
              AND (to_tsvector('simple', c.body) @@ plainto_tsquery('simple', $3) OR c.body ILIKE $4)
            ORDER BY c.created_at DESC LIMIT 15`,
          [workspaceId, spaceIds, q, like])
      : { rows: [] as any[] },
    db.query(
      `SELECT p.id AS page_id, p.title AS page_title, d.id AS doc_id, d.title AS doc_title, p.updated_at
         FROM work.doc_pages p JOIN work.docs d ON d.id = p.doc_id
        WHERE d.workspace_id = $1 AND d.archived_at IS NULL
          AND (d.space_id IS NULL OR d.space_id = ANY($2))
          AND (to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p.content,'')) @@ plainto_tsquery('simple', $3)
               OR p.title ILIKE $4)
        ORDER BY p.updated_at DESC LIMIT 15`,
      [workspaceId, spaceIds.length ? spaceIds : ['-'], q, like]),
    spaceIds.length
      ? db.query(
          `SELECT id, name, 'space' AS kind FROM work.spaces WHERE id = ANY($1) AND archived_at IS NULL AND name ILIKE $2 LIMIT 5`,
          [spaceIds, like])
      : { rows: [] as any[] },
    spaceIds.length
      ? db.query(
          `SELECT id, name, 'list' AS kind FROM work.lists WHERE space_id = ANY($1) AND archived_at IS NULL AND name ILIKE $2 LIMIT 8`,
          [spaceIds, like])
      : { rows: [] as any[] },
    spaceIds.length
      ? db.query(
          `SELECT id, name, 'folder' AS kind FROM work.folders WHERE space_id = ANY($1) AND archived_at IS NULL AND name ILIKE $2 LIMIT 5`,
          [spaceIds, like])
      : { rows: [] as any[] }
  ])

  return {
    tasks: tasks.items,
    comments: comments.rows,
    docs: docs.rows,
    locations: [...spaces.rows, ...folders.rows, ...lists.rows]
  }
})
