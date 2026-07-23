import { requireWork } from '~~/layers/work/server/utils/workStore'
import { queryTasks } from '~~/layers/work/server/utils/workTasks'

/**
 * Filtered, paginated task query powering List/Board/Table views, Everything,
 * and pickers. Keyset cursor on the default (created) sort; every result is
 * scoped to the caller's visible spaces.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const q = getQuery(event)
  const str = (key: string) => (q[key] !== undefined && q[key] !== '' ? String(q[key]) : null)
  const statusIds = str('status_ids')?.split(',').map((s) => s.trim()).filter(Boolean)

  return queryTasks(user, tier, workspaceId, {
    listId: str('list_id'),
    spaceId: str('space_id'),
    folderId: str('folder_id'),
    parentId: str('parent_id'),
    topLevelOnly: q.top_level === 'true',
    assignee: q.assignee === 'me' ? user.username : str('assignee'),
    createdBy: str('created_by'),
    statusIds,
    excludeClosed: q.include_closed !== 'true',
    excludeDone: q.exclude_done === 'true',
    priority: str('priority'),
    tagId: str('tag_id'),
    typeId: str('type_id'),
    dueBefore: str('due_before'),
    dueAfter: str('due_after'),
    overdue: q.overdue === 'true',
    includeArchived: q.include_archived === 'true',
    q: str('q'),
    sort: str('sort') || undefined,
    limit: q.limit ? Number(q.limit) : undefined,
    offset: q.offset ? Number(q.offset) : undefined,
    cursor: str('cursor')
  })
})
