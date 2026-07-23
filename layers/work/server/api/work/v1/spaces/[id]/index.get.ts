import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Space detail: folders, lists, statuses, tags, and (for private) members. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const spaceId = String(getRouterParam(event, 'id'))
  const { space, access } = await assertSpaceAccess(user, tier, workspaceId, spaceId)
  const db = getWork()

  const [folders, lists, statuses, tags, members, taskCounts] = await Promise.all([
    db.query('SELECT * FROM work.folders WHERE space_id = $1 AND archived_at IS NULL ORDER BY order_index, created_at', [spaceId]),
    db.query('SELECT * FROM work.lists WHERE space_id = $1 AND archived_at IS NULL ORDER BY order_index, created_at', [spaceId]),
    db.query('SELECT * FROM work.statuses WHERE space_id = $1 AND list_id IS NULL ORDER BY order_index', [spaceId]),
    db.query('SELECT * FROM work.tags WHERE space_id = $1 ORDER BY name', [spaceId]),
    space.private
      ? db.query('SELECT username, access, added_at, added_by FROM work.space_members WHERE space_id = $1 ORDER BY username', [spaceId])
      : Promise.resolve({ rows: [] as any[] }),
    db.query(
      `SELECT list_id, count(*)::int AS n FROM work.tasks
        WHERE space_id = $1 AND deleted_at IS NULL AND archived_at IS NULL AND completed_at IS NULL GROUP BY list_id`, [spaceId])
  ])

  const tasksByList = new Map(taskCounts.rows.map((r) => [r.list_id, r.n]))
  return {
    ...space,
    access,
    statuses: statuses.rows,
    tags: tags.rows,
    members: members.rows,
    folders: folders.rows.map((f) => ({
      ...f,
      lists: lists.rows.filter((l) => l.folder_id === f.id).map((l) => ({ ...l, open_tasks: tasksByList.get(l.id) || 0 }))
    })),
    lists: lists.rows.filter((l) => !l.folder_id).map((l) => ({ ...l, open_tasks: tasksByList.get(l.id) || 0 }))
  }
})
