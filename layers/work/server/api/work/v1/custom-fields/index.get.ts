import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess, assertSpaceAccess, visibleSpaceIds } from '~~/layers/work/server/utils/workAccess'

/**
 * Custom field definitions. Without a scope filter, returns every definition
 * the caller may see (workspace-wide plus fields in visible spaces).
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const query = getQuery(event)
  const db = getWork()

  const scopeType = query.scope_type ? String(query.scope_type) : null
  const scopeId = query.scope_id ? String(query.scope_id) : null
  if (scopeType && !['workspace', 'space', 'folder', 'list'].includes(scopeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scope_type' })
  }
  if (scopeType === 'space' && scopeId) await assertSpaceAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'folder' && scopeId) await assertFolderAccess(user, tier, workspaceId, scopeId)
  if (scopeType === 'list' && scopeId) await assertListAccess(user, tier, workspaceId, scopeId)

  if (scopeType) {
    const { rows } = await db.query(
      `SELECT * FROM work.custom_fields
        WHERE workspace_id = $1 AND archived_at IS NULL AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3
        ORDER BY order_index, created_at`,
      [workspaceId, scopeType, scopeType === 'workspace' ? null : scopeId])
    return rows
  }

  const spaceIds = await visibleSpaceIds(user, tier, workspaceId)
  const { rows } = await db.query(
    `SELECT f.* FROM work.custom_fields f
      WHERE f.workspace_id = $1 AND f.archived_at IS NULL
        AND (f.scope_type = 'workspace'
             OR (f.scope_type = 'space' AND f.scope_id = ANY($2))
             OR (f.scope_type = 'folder' AND EXISTS (SELECT 1 FROM work.folders fo WHERE fo.id = f.scope_id AND fo.space_id = ANY($2)))
             OR (f.scope_type = 'list' AND EXISTS (SELECT 1 FROM work.lists l WHERE l.id = f.scope_id AND l.space_id = ANY($2))))
      ORDER BY f.scope_type, f.order_index, f.created_at`,
    [workspaceId, spaceIds])
  return rows
})
