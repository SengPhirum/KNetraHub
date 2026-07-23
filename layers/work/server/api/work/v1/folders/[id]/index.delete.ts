import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess } from '~~/layers/work/server/utils/workAccess'

/** Permanently delete a folder (admin: work.delete). Lists inside survive as folderless. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.delete')
  const folderId = String(getRouterParam(event, 'id'))
  const { folder } = await assertFolderAccess(user, tier, workspaceId, folderId, 'full')
  const db = getWork()
  // lists.folder_id is ON DELETE SET NULL — lists and their tasks are preserved.
  const lists = await db.query('SELECT count(*)::int AS n FROM work.lists WHERE folder_id = $1', [folderId])
  await db.query('DELETE FROM work.folders WHERE id = $1 AND workspace_id = $2', [folderId, workspaceId])
  await workAudit(user, 'folder.deleted', folderId, `${folder.name} (${lists.rows[0].n} list(s) kept, now folderless)`)
  return { deleted: true, lists_kept: lists.rows[0].n }
})
