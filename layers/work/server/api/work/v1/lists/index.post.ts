import {
  getWork, newId, optionalColor, optionalDate, optionalPriority, optionalText,
  recordActivity, requestId, requireText, requireWorkPermission
} from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Create a list (folderless or inside a folder). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  const spaceId = String(body?.space_id || '')
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'edit')
  const name = requireText(body?.name, 'List name', 120)

  let folderId: string | null = null
  if (body?.folder_id) {
    const { folder } = await assertFolderAccess(user, tier, workspaceId, String(body.folder_id), 'edit')
    if (folder.space_id !== spaceId) throw createError({ statusCode: 400, statusMessage: 'Folder is in a different space' })
    folderId = folder.id
  }

  const id = newId()
  const db = getWork()
  await db.query(
    `INSERT INTO work.lists (id, workspace_id, space_id, folder_id, name, description, icon, color, due_at, priority, order_index, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
    [id, workspaceId, spaceId, folderId, name,
      optionalText(body?.description, 'Description', 2000), optionalText(body?.icon, 'Icon', 60),
      optionalColor(body?.color), optionalDate(body?.due_at, 'Due date'), optionalPriority(body?.priority),
      Date.now(), user.username])
  await recordActivity(db, {
    workspaceId, entityType: 'list', entityId: id, actor: user.username,
    action: 'created', detail: `${space.name} / ${name}`, requestId: requestId(event)
  })
  return { id }
})
