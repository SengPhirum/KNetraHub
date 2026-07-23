import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { visibleSpaceIds } from '~~/layers/work/server/utils/workAccess'

/**
 * Visible spaces with their folders and lists nested (the hierarchy tree).
 * Private spaces the caller is not a member of are absent entirely.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const query = getQuery(event)
  const includeArchived = query.archived === 'true'
  const db = getWork()

  const spaceIds = await visibleSpaceIds(user, tier, workspaceId, { includeArchived })
  if (!spaceIds.length) return []

  const archived = includeArchived ? '' : 'AND archived_at IS NULL'
  const [spaces, folders, lists, taskCounts] = await Promise.all([
    db.query(`SELECT * FROM work.spaces WHERE id = ANY($1) ORDER BY order_index, created_at`, [spaceIds]),
    db.query(`SELECT * FROM work.folders WHERE space_id = ANY($1) ${archived} ORDER BY order_index, created_at`, [spaceIds]),
    db.query(`SELECT * FROM work.lists WHERE space_id = ANY($1) ${archived} ORDER BY order_index, created_at`, [spaceIds]),
    db.query(
      `SELECT list_id, count(*)::int AS n FROM work.tasks
        WHERE space_id = ANY($1) AND deleted_at IS NULL AND archived_at IS NULL AND completed_at IS NULL
        GROUP BY list_id`, [spaceIds])
  ])

  const tasksByList = new Map(taskCounts.rows.map((r) => [r.list_id, r.n]))
  return spaces.rows.map((space) => ({
    ...space,
    folders: folders.rows
      .filter((f) => f.space_id === space.id)
      .map((f) => ({
        ...f,
        lists: lists.rows.filter((l) => l.folder_id === f.id).map((l) => ({ ...l, open_tasks: tasksByList.get(l.id) || 0 }))
      })),
    lists: lists.rows
      .filter((l) => l.space_id === space.id && !l.folder_id)
      .map((l) => ({ ...l, open_tasks: tasksByList.get(l.id) || 0 }))
  }))
})
