import { getWork, newId, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'
import { sanitizeViewConfig, VIEW_TYPES } from '~~/layers/work/server/utils/workViews'

/** Save a view. Private views need operator tier; shared views need work.share. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  const isPrivate = body?.is_private !== false
  if (!isPrivate && !['manager', 'admin'].includes(tier)) {
    throw createError({ statusCode: 403, statusMessage: 'Sharing a view with everyone requires manager access' })
  }

  const scopeType = String(body?.scope_type || 'everything')
  const scopeId = body?.scope_id ? String(body.scope_id) : null
  if (!['everything', 'space', 'folder', 'list'].includes(scopeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scope_type' })
  }
  if (scopeType !== 'everything' && !scopeId) throw createError({ statusCode: 400, statusMessage: 'scope_id is required' })
  if (scopeType === 'space' && scopeId) await assertSpaceAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'folder' && scopeId) await assertFolderAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'list' && scopeId) await assertListAccess(user, tier, workspaceId, scopeId)

  const viewType = String(body?.view_type || 'list')
  if (!(VIEW_TYPES as readonly string[]).includes(viewType)) {
    throw createError({ statusCode: 400, statusMessage: `view_type must be one of: ${VIEW_TYPES.join(', ')}` })
  }

  const id = newId()
  await getWork().query(
    `INSERT INTO work.views (id, workspace_id, scope_type, scope_id, name, view_type, config, is_private, owner, order_index, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9)`,
    [id, workspaceId, scopeType, scopeType === 'everything' ? null : scopeId,
      requireText(body?.name, 'View name', 100), viewType,
      JSON.stringify(sanitizeViewConfig(body?.config)), isPrivate, user.username, Date.now()])
  return { id }
})
