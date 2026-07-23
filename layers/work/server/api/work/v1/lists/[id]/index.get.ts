import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertListAccess } from '~~/layers/work/server/utils/workAccess'
import { effectiveStatuses } from '~~/layers/work/server/utils/workTasks'
import { fieldsForList } from '~~/layers/work/server/utils/workFields'

/** List detail: effective statuses, applicable custom fields, tags, saved views. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const listId = String(getRouterParam(event, 'id'))
  const { list, space, access } = await assertListAccess(user, tier, workspaceId, listId)
  const db = getWork()

  const [statuses, fields, tags, views, folder] = await Promise.all([
    effectiveStatuses(list, db),
    fieldsForList(workspaceId, list, db),
    db.query('SELECT * FROM work.tags WHERE space_id = $1 ORDER BY name', [list.space_id]),
    db.query(
      `SELECT * FROM work.views
        WHERE workspace_id = $1 AND scope_type = 'list' AND scope_id = $2
          AND (is_private = false OR lower(owner) = lower($3))
        ORDER BY order_index, created_at`, [workspaceId, listId, user.username]),
    list.folder_id ? db.query('SELECT id, name, parent_folder_id FROM work.folders WHERE id = $1', [list.folder_id]) : Promise.resolve({ rows: [] as any[] })
  ])

  const hasOwnStatuses = statuses.length > 0 && statuses[0].list_id === listId
  return {
    ...list,
    access,
    space: { id: space.id, name: space.name, color: space.color, private: space.private, task_prefix: space.task_prefix },
    folder: folder.rows[0] || null,
    statuses,
    statuses_overridden: hasOwnStatuses,
    custom_fields: fields,
    tags: tags.rows,
    views: views.rows
  }
})
