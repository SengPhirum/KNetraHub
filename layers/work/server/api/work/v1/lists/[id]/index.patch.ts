import {
  getWork, nowIso, optionalColor, optionalDate, optionalPriority, optionalText,
  recordActivity, requestId, requireText, requireWorkPermission
} from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess } from '~~/layers/work/server/utils/workAccess'

/** Update a list (rename, move between folders in its space, archive/restore). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const listId = String(getRouterParam(event, 'id'))
  const { list } = await assertListAccess(user, tier, workspaceId, listId, 'edit')
  const body = await readBody(event)

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }

  if (body?.name !== undefined) set('name', requireText(body.name, 'List name', 120))
  if (body?.description !== undefined) set('description', optionalText(body.description, 'Description', 2000))
  if (body?.icon !== undefined) set('icon', optionalText(body.icon, 'Icon', 60))
  if (body?.color !== undefined) set('color', optionalColor(body.color))
  if (body?.due_at !== undefined) set('due_at', optionalDate(body.due_at, 'Due date'))
  if (body?.priority !== undefined) set('priority', optionalPriority(body.priority))
  if (body?.order_index !== undefined && Number.isFinite(Number(body.order_index))) set('order_index', Number(body.order_index))
  if (body?.folder_id !== undefined) {
    let folderId: string | null = null
    if (body.folder_id) {
      const { folder } = await assertFolderAccess(user, tier, workspaceId, String(body.folder_id), 'edit')
      if (folder.space_id !== list.space_id) {
        throw createError({ statusCode: 400, statusMessage: 'Moving a list to another space is not supported yet — its tasks carry space-scoped statuses and tags' })
      }
      folderId = folder.id
    }
    set('folder_id', folderId)
  }
  if (body?.archived !== undefined) set('archived_at', body.archived ? nowIso() : null)
  if (!sets.length) return { id: listId, version: list.version }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(listId)
  const db = getWork()
  const { rows } = await db.query(`UPDATE work.lists SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
  await recordActivity(db, {
    workspaceId, entityType: 'list', entityId: listId, actor: user.username,
    action: 'updated', detail: list.name, requestId: requestId(event)
  })
  return { id: listId, version: rows[0].version }
})
