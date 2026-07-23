import type { Pool, PoolClient } from 'pg'
import type { SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'
import { getWork } from './workStore'

/**
 * Object-level authorization inside the Work app, layered on top of the
 * portal app-tier boundary (workStore.requireWork*):
 *
 *  - Public spaces are visible to every workspace member; edit rights follow
 *    the caller's app tier (operator+ mutates, viewer reads).
 *  - Private spaces are visible only to their creator, explicit
 *    work.space_members grants, and app-tier admins. Grant levels order
 *    view < comment < edit < full; the creator implicitly holds full.
 *  - Folders, lists, tasks, comments, checklists … inherit their space's
 *    access — every accessor here resolves the owning space and re-checks.
 *
 * Every query is parameterized and every accessor filters by workspace, so
 * cross-tenant/IDOR probes 404 rather than leak existence.
 */

export type SpaceAccess = 'view' | 'comment' | 'edit' | 'full'
const ACCESS_RANK: Record<SpaceAccess, number> = { view: 1, comment: 2, edit: 3, full: 4 }

export interface SpaceRow {
  id: string
  workspace_id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  private: boolean
  task_prefix: string | null
  order_index: number
  archived_at: string | null
  created_by: string
  version: number
}

function notFound(entity: string): never {
  throw createError({ statusCode: 404, statusMessage: `${entity} not found` })
}

/** The caller's effective access level on a space row, or null if invisible. */
export async function spaceAccessLevel(
  user: SessionUser,
  tier: AppTier,
  space: Pick<SpaceRow, 'id' | 'private' | 'created_by'>,
  db: Pool | PoolClient = getWork()
): Promise<SpaceAccess | null> {
  if (tier === 'admin') return 'full'
  if (!space.private) {
    // Public space: rights follow the app tier.
    return tier === 'viewer' ? 'view' : 'full'
  }
  if (space.created_by.toLowerCase() === user.username.toLowerCase()) return 'full'
  const { rows } = await db.query(
    'SELECT access FROM work.space_members WHERE space_id = $1 AND lower(username) = lower($2)',
    [space.id, user.username]
  )
  if (!rows.length) return null
  const access = rows[0].access as SpaceAccess
  // A private-space grant can never exceed what the app tier allows.
  if (tier === 'viewer' && ACCESS_RANK[access] > ACCESS_RANK.view) return 'view'
  return access
}

/** Load a space and require at least `need` access, or 404/403. */
export async function assertSpaceAccess(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  spaceId: string,
  need: SpaceAccess = 'view',
  db: Pool | PoolClient = getWork()
): Promise<{ space: SpaceRow; access: SpaceAccess }> {
  const { rows } = await db.query('SELECT * FROM work.spaces WHERE id = $1 AND workspace_id = $2', [spaceId, workspaceId])
  if (!rows.length) notFound('Space')
  const space = rows[0] as SpaceRow
  const access = await spaceAccessLevel(user, tier, space, db)
  // Invisible private space: report 404, never confirm existence.
  if (!access) notFound('Space')
  if (ACCESS_RANK[access] < ACCESS_RANK[need]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${need} access to this space` })
  }
  return { space, access }
}

/**
 * Space ids the caller may see (for list/search/aggregate queries). Includes
 * archived spaces only when asked; private spaces require membership.
 */
export async function visibleSpaceIds(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  opts: { includeArchived?: boolean } = {},
  db: Pool | PoolClient = getWork()
): Promise<string[]> {
  const archived = opts.includeArchived ? '' : 'AND s.archived_at IS NULL'
  if (tier === 'admin') {
    const { rows } = await db.query(`SELECT s.id FROM work.spaces s WHERE s.workspace_id = $1 ${archived}`, [workspaceId])
    return rows.map((r) => r.id)
  }
  const { rows } = await db.query(
    `SELECT s.id FROM work.spaces s
      WHERE s.workspace_id = $1 ${archived}
        AND (s.private = false
             OR lower(s.created_by) = lower($2)
             OR EXISTS (SELECT 1 FROM work.space_members m WHERE m.space_id = s.id AND lower(m.username) = lower($2)))`,
    [workspaceId, user.username]
  )
  return rows.map((r) => r.id)
}

export interface ListRow {
  id: string
  workspace_id: string
  space_id: string
  folder_id: string | null
  name: string
  description: string | null
  icon: string | null
  color: string | null
  due_at: string | null
  priority: string | null
  order_index: number
  archived_at: string | null
  version: number
}

/** Load a list and require access to its space. */
export async function assertListAccess(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  listId: string,
  need: SpaceAccess = 'view',
  db: Pool | PoolClient = getWork()
): Promise<{ list: ListRow; space: SpaceRow; access: SpaceAccess }> {
  const { rows } = await db.query('SELECT * FROM work.lists WHERE id = $1 AND workspace_id = $2', [listId, workspaceId])
  if (!rows.length) notFound('List')
  const list = rows[0] as ListRow
  const { space, access } = await assertSpaceAccess(user, tier, workspaceId, list.space_id, need, db)
  return { list, space, access }
}

/** Load a folder and require access to its space. */
export async function assertFolderAccess(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  folderId: string,
  need: SpaceAccess = 'view',
  db: Pool | PoolClient = getWork()
): Promise<{ folder: any; space: SpaceRow; access: SpaceAccess }> {
  const { rows } = await db.query('SELECT * FROM work.folders WHERE id = $1 AND workspace_id = $2', [folderId, workspaceId])
  if (!rows.length) notFound('Folder')
  const folder = rows[0]
  const { space, access } = await assertSpaceAccess(user, tier, workspaceId, folder.space_id, need, db)
  return { folder, space, access }
}

export interface TaskRow {
  id: string
  workspace_id: string
  space_id: string
  list_id: string
  parent_id: string | null
  type_id: string | null
  custom_id: string | null
  name: string
  description: string
  status_id: string | null
  priority: string | null
  start_at: string | null
  due_at: string | null
  all_day: boolean
  time_estimate_minutes: number | null
  order_index: number
  completed_at: string | null
  archived_at: string | null
  deleted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  version: number
}

/** Load a live (non-purged) task and require access to its space. */
export async function assertTaskAccess(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  taskId: string,
  need: SpaceAccess = 'view',
  opts: { allowDeleted?: boolean } = {},
  db: Pool | PoolClient = getWork()
): Promise<{ task: TaskRow; space: SpaceRow; access: SpaceAccess }> {
  const { rows } = await db.query('SELECT * FROM work.tasks WHERE id = $1 AND workspace_id = $2', [taskId, workspaceId])
  if (!rows.length) notFound('Task')
  const task = rows[0] as TaskRow
  if (task.deleted_at && !opts.allowDeleted) notFound('Task')
  const { space, access } = await assertSpaceAccess(user, tier, workspaceId, task.space_id, need, db)
  return { task, space, access }
}

/** Load a doc and require access to its space (workspace docs are public). */
export async function assertDocAccess(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  docId: string,
  need: SpaceAccess = 'view',
  db: Pool | PoolClient = getWork()
): Promise<{ doc: any; access: SpaceAccess }> {
  const { rows } = await db.query('SELECT * FROM work.docs WHERE id = $1 AND workspace_id = $2', [docId, workspaceId])
  if (!rows.length) notFound('Doc')
  const doc = rows[0]
  if (doc.space_id) {
    const { access } = await assertSpaceAccess(user, tier, workspaceId, doc.space_id, need, db)
    return { doc, access }
  }
  // Workspace-level doc: rights follow the app tier.
  const access: SpaceAccess = tier === 'viewer' ? 'view' : 'full'
  if (ACCESS_RANK[access] < ACCESS_RANK[need]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${need} access to this doc` })
  }
  return { doc, access }
}
