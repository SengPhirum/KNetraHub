import {
  getWork, nowIso, optionalColor, optionalText, recordActivity, requestId,
  requireText, requireWorkPermission
} from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess } from '~~/layers/work/server/utils/workAccess'

/** Update a folder (rename, color, order, archive/restore). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const folderId = String(getRouterParam(event, 'id'))
  const { folder } = await assertFolderAccess(user, tier, workspaceId, folderId, 'edit')
  const body = await readBody(event)

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }

  if (body?.name !== undefined) set('name', requireText(body.name, 'Folder name', 120))
  if (body?.description !== undefined) set('description', optionalText(body.description, 'Description', 2000))
  if (body?.color !== undefined) set('color', optionalColor(body.color))
  if (body?.order_index !== undefined && Number.isFinite(Number(body.order_index))) set('order_index', Number(body.order_index))
  if (body?.archived !== undefined) set('archived_at', body.archived ? nowIso() : null)
  if (!sets.length) return { id: folderId, version: folder.version }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(folderId)
  const db = getWork()
  const { rows } = await db.query(`UPDATE work.folders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
  await recordActivity(db, {
    workspaceId, entityType: 'folder', entityId: folderId, actor: user.username,
    action: 'updated', detail: folder.name, requestId: requestId(event)
  })
  return { id: folderId, version: rows[0].version }
})
