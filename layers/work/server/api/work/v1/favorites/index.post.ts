import { getWork, newId, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess, assertFolderAccess, assertListAccess, assertSpaceAccess, assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Toggle a favorite (space/folder/list/task/doc/view) for the caller. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const body = await readBody(event)
  const entityType = String(body?.entity_type || '')
  const entityId = String(body?.entity_id || '')
  if (!['space', 'folder', 'list', 'task', 'doc', 'view'].includes(entityType) || !entityId) {
    throw createError({ statusCode: 400, statusMessage: 'entity_type and entity_id are required' })
  }
  // Favoriting requires the caller to actually see the target.
  if (entityType === 'space') await assertSpaceAccess(user, tier, workspaceId, entityId)
  else if (entityType === 'folder') await assertFolderAccess(user, tier, workspaceId, entityId)
  else if (entityType === 'list') await assertListAccess(user, tier, workspaceId, entityId)
  else if (entityType === 'task') await assertTaskAccess(user, tier, workspaceId, entityId)
  else if (entityType === 'doc') await assertDocAccess(user, tier, workspaceId, entityId)
  else {
    const { rows } = await getWork().query(
      `SELECT 1 FROM work.views WHERE id = $1 AND workspace_id = $2 AND (is_private = false OR lower(owner) = lower($3))`,
      [entityId, workspaceId, user.username])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'View not found' })
  }

  const db = getWork()
  const me = user.username.toLowerCase()
  const existing = await db.query(
    'SELECT id FROM work.favorites WHERE lower(username) = $1 AND entity_type = $2 AND entity_id = $3', [me, entityType, entityId])
  if (existing.rows.length) {
    await db.query('DELETE FROM work.favorites WHERE id = $1', [existing.rows[0].id])
    return { favorited: false }
  }
  await db.query(
    'INSERT INTO work.favorites (id, workspace_id, username, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)',
    [newId(), workspaceId, me, entityType, entityId])
  return { favorited: true }
})
