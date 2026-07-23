import {
  getWork, newId, optionalColor, optionalText, recordActivity, requestId,
  requireText, requireWorkPermission
} from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Create a folder (or one-level subfolder) in a space. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  const spaceId = String(body?.space_id || '')
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'edit')
  const name = requireText(body?.name, 'Folder name', 120)

  let parentFolderId: string | null = null
  if (body?.parent_folder_id) {
    const { folder: parent } = await assertFolderAccess(user, tier, workspaceId, String(body.parent_folder_id), 'edit')
    if (parent.space_id !== spaceId) throw createError({ statusCode: 400, statusMessage: 'Parent folder is in a different space' })
    if (parent.parent_folder_id) throw createError({ statusCode: 400, statusMessage: 'Folders support one level of subfolders' })
    parentFolderId = parent.id
  }

  const id = newId()
  const db = getWork()
  await db.query(
    `INSERT INTO work.folders (id, workspace_id, space_id, parent_folder_id, name, description, color, order_index, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
    [id, workspaceId, spaceId, parentFolderId, name,
      optionalText(body?.description, 'Description', 2000), optionalColor(body?.color), Date.now(), user.username])
  await recordActivity(db, {
    workspaceId, entityType: 'folder', entityId: id, actor: user.username,
    action: 'created', detail: `${space.name} / ${name}`, requestId: requestId(event)
  })
  return { id }
})
