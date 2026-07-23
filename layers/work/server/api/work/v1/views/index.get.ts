import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Saved views for a scope: shared views plus the caller's private ones. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const q = getQuery(event)
  const scopeType = String(q.scope_type || 'everything')
  const scopeId = q.scope_id ? String(q.scope_id) : null
  if (!['everything', 'space', 'folder', 'list'].includes(scopeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scope_type' })
  }
  if (scopeType === 'space' && scopeId) await assertSpaceAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'folder' && scopeId) await assertFolderAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'list' && scopeId) await assertListAccess(user, tier, workspaceId, scopeId)

  const { rows } = await getWork().query(
    `SELECT * FROM work.views
      WHERE workspace_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3
        AND (is_private = false OR lower(owner) = lower($4))
      ORDER BY order_index, created_at`,
    [workspaceId, scopeType, scopeType === 'everything' ? null : scopeId, user.username])
  return rows
})
