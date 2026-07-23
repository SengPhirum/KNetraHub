import type { Pool, PoolClient } from 'pg'
import type { SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'
import { getWork } from './workStore'
import { visibleSpaceIds } from './workAccess'
import { fieldsForList } from './workFields'

/**
 * Task read model: filtered/paginated queries for the List/Board/Table views,
 * My Tasks and Everything, plus full single-task detail assembly. All queries
 * are parameterized, scoped to the workspace AND the caller's visible spaces,
 * and never trust client-supplied SQL fragments (sort keys map through a
 * whitelist).
 */

const SORTS: Record<string, string> = {
  order: 't.order_index ASC, t.created_at ASC',
  created: 't.created_at DESC, t.id DESC',
  updated: 't.updated_at DESC, t.id DESC',
  due: 't.due_at ASC NULLS LAST, t.created_at DESC',
  name: 'lower(t.name) ASC',
  priority: `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END ASC, t.created_at DESC`
}

export interface TaskQuery {
  listId?: string | null
  spaceId?: string | null
  folderId?: string | null
  parentId?: string | null
  topLevelOnly?: boolean
  assignee?: string | null
  createdBy?: string | null
  statusIds?: string[]
  excludeClosed?: boolean
  excludeDone?: boolean
  priority?: string | null
  tagId?: string | null
  typeId?: string | null
  dueBefore?: string | null
  dueAfter?: string | null
  overdue?: boolean
  includeArchived?: boolean
  q?: string | null
  sort?: string
  limit?: number
  offset?: number
  cursor?: string | null
}

export interface TaskListItem {
  id: string
  custom_id: string | null
  name: string
  list_id: string
  list_name: string
  space_id: string
  space_name: string
  parent_id: string | null
  type_id: string | null
  type_name: string | null
  type_icon: string | null
  status_id: string | null
  status_name: string | null
  status_color: string | null
  status_group: string | null
  priority: string | null
  start_at: string | null
  due_at: string | null
  all_day: boolean
  time_estimate_minutes: number | null
  order_index: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
  created_by: string
  updated_at: string
  version: number
  assignees: { username: string }[]
  tags: { id: string; name: string; color: string }[]
  subtask_count: number
  subtask_done: number
  comment_count: number
}

const TASK_FROM = `
    FROM work.tasks t
    JOIN work.lists l ON l.id = t.list_id
    JOIN work.spaces s ON s.id = t.space_id
    LEFT JOIN work.task_types tt ON tt.id = t.type_id
    LEFT JOIN work.statuses st ON st.id = t.status_id`

const TASK_SELECT = `
  SELECT t.id, t.custom_id, t.name, t.list_id, l.name AS list_name, t.space_id, s.name AS space_name,
         t.parent_id, t.type_id, tt.name AS type_name, tt.icon AS type_icon,
         t.status_id, st.name AS status_name, st.color AS status_color, st.status_group,
         t.priority, t.start_at, t.due_at, t.all_day, t.time_estimate_minutes, t.order_index,
         t.completed_at, t.archived_at, t.created_at, t.created_by, t.updated_at, t.version,
         (SELECT count(*) FROM work.tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL)::int AS subtask_count,
         (SELECT count(*) FROM work.tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL AND c.completed_at IS NOT NULL)::int AS subtask_done,
         (SELECT count(*) FROM work.comments cm WHERE cm.task_id = t.id AND cm.deleted_at IS NULL)::int AS comment_count
  ${TASK_FROM}`

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null
    return { createdAt, id }
  } catch { return null }
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${new Date(createdAt).toISOString()}|${id}`, 'utf8').toString('base64url')
}

export async function queryTasks(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  query: TaskQuery,
  db: Pool | PoolClient = getWork()
): Promise<{ items: TaskListItem[]; total: number; nextCursor: string | null }> {
  const spaceIds = await visibleSpaceIds(user, tier, workspaceId, { includeArchived: query.includeArchived === true }, db)
  if (!spaceIds.length) return { items: [], total: 0, nextCursor: null }

  const where: string[] = ['t.workspace_id = $1', 't.deleted_at IS NULL', 't.space_id = ANY($2)']
  const params: unknown[] = [workspaceId, spaceIds]
  const arg = (value: unknown): string => { params.push(value); return `$${params.length}` }

  if (!query.includeArchived) where.push('t.archived_at IS NULL')
  if (query.listId) {
    // Home list plus additional List memberships.
    where.push(`(t.list_id = ${arg(query.listId)} OR EXISTS (
      SELECT 1 FROM work.task_list_memberships m WHERE m.task_id = t.id AND m.list_id = ${arg(query.listId)}))`)
  }
  if (query.spaceId) where.push(`t.space_id = ${arg(query.spaceId)}`)
  if (query.folderId) where.push(`l.folder_id = ${arg(query.folderId)}`)
  if (query.parentId) where.push(`t.parent_id = ${arg(query.parentId)}`)
  else if (query.topLevelOnly) where.push('t.parent_id IS NULL')
  if (query.assignee) {
    where.push(`EXISTS (SELECT 1 FROM work.task_assignees a WHERE a.task_id = t.id AND lower(a.username) = lower(${arg(query.assignee)}))`)
  }
  if (query.createdBy) where.push(`lower(t.created_by) = lower(${arg(query.createdBy)})`)
  if (query.statusIds?.length) where.push(`t.status_id = ANY(${arg(query.statusIds)})`)
  if (query.excludeClosed) where.push(`(st.status_group IS NULL OR st.status_group <> 'closed')`)
  if (query.excludeDone) where.push(`(st.status_group IS NULL OR st.status_group NOT IN ('done','closed'))`)
  if (query.priority) where.push(`t.priority = ${arg(query.priority)}`)
  if (query.tagId) where.push(`EXISTS (SELECT 1 FROM work.task_tags g WHERE g.task_id = t.id AND g.tag_id = ${arg(query.tagId)})`)
  if (query.typeId) where.push(`t.type_id = ${arg(query.typeId)}`)
  if (query.dueBefore) where.push(`t.due_at IS NOT NULL AND t.due_at <= ${arg(query.dueBefore)}`)
  if (query.dueAfter) where.push(`t.due_at IS NOT NULL AND t.due_at >= ${arg(query.dueAfter)}`)
  if (query.overdue) where.push(`t.due_at IS NOT NULL AND t.due_at < now() AND t.completed_at IS NULL`)
  if (query.q) {
    where.push(`(to_tsvector('simple', coalesce(t.name,'') || ' ' || coalesce(t.description,'')) @@ plainto_tsquery('simple', ${arg(query.q)})
      OR t.name ILIKE ${arg(`%${query.q}%`)} OR t.custom_id ILIKE ${arg(`%${query.q}%`)})`)
  }

  const sortKey = query.sort && SORTS[query.sort] ? query.sort : 'created'
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200)

  // Total ignores the cursor (count of everything matching the filters), so
  // capture the filter params before appending keyset-cursor params.
  const countSql = `SELECT count(*)::int AS total ${TASK_FROM} WHERE ${where.join(' AND ')}`
  const countParams = [...params]

  // Keyset pagination on the default (created) sort; bounded offset otherwise.
  let cursorClause = ''
  if (query.cursor && sortKey === 'created') {
    const decoded = decodeCursor(query.cursor)
    if (decoded) cursorClause = ` AND (t.created_at, t.id) < (${arg(decoded.createdAt)}, ${arg(decoded.id)})`
  }
  const offset = !query.cursor ? Math.min(Math.max(Number(query.offset) || 0, 0), 10_000) : 0

  const whereSql = where.join(' AND ') + cursorClause
  const countResult = await db.query(countSql, countParams)

  const { rows } = await db.query(
    `${TASK_SELECT} WHERE ${whereSql} ORDER BY ${SORTS[sortKey]} LIMIT ${limit + 1}${offset ? ` OFFSET ${offset}` : ''}`,
    params
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  await attachSatellites(page, db)

  const last = page[page.length - 1]
  const nextCursor = hasMore && sortKey === 'created' && last ? encodeCursor(last.created_at, last.id) : null
  return { items: page as TaskListItem[], total: countResult.rows[0]?.total ?? page.length, nextCursor }
}

/** Batch-load assignees + tags for a page of task rows (no N+1). */
export async function attachSatellites(rows: any[], db: Pool | PoolClient = getWork()): Promise<void> {
  if (!rows.length) return
  const ids = rows.map((r) => r.id)
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const row of rows) { row.assignees = []; row.tags = [] }
  const assignees = await db.query(
    'SELECT task_id, username FROM work.task_assignees WHERE task_id = ANY($1) ORDER BY assigned_at', [ids])
  for (const a of assignees.rows) byId.get(a.task_id)?.assignees.push({ username: a.username })
  const tags = await db.query(
    `SELECT tt.task_id, g.id, g.name, g.color FROM work.task_tags tt JOIN work.tags g ON g.id = tt.tag_id
      WHERE tt.task_id = ANY($1) ORDER BY g.name`, [ids])
  for (const t of tags.rows) byId.get(t.task_id)?.tags.push({ id: t.id, name: t.name, color: t.color })
}

/** The effective status set for a list: its own override or the space default. */
export async function effectiveStatuses(
  list: { id: string; space_id: string },
  db: Pool | PoolClient = getWork()
): Promise<any[]> {
  const own = await db.query(
    'SELECT * FROM work.statuses WHERE list_id = $1 ORDER BY order_index, created_at', [list.id])
  if (own.rows.length) return own.rows
  const inherited = await db.query(
    'SELECT * FROM work.statuses WHERE space_id = $1 AND list_id IS NULL ORDER BY order_index, created_at', [list.space_id])
  return inherited.rows
}

/** Full single-task detail: satellites, checklists, dependencies, fields, subtasks. */
export async function taskDetail(
  user: SessionUser,
  tier: AppTier,
  workspaceId: string,
  taskId: string,
  db: Pool | PoolClient = getWork()
): Promise<any> {
  const { rows } = await db.query(
    `${TASK_SELECT.replace('SELECT t.id,', 'SELECT t.description, t.deleted_at, t.id,')} WHERE t.id = $1 AND t.workspace_id = $2`,
    [taskId, workspaceId]
  )
  if (!rows.length || rows[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  const task = rows[0]
  await attachSatellites([task], db)

  const [followers, checklists, items, waitingOn, blocking, related, listRow, memberships, timeTotal] = await Promise.all([
    db.query('SELECT username FROM work.task_followers WHERE task_id = $1 ORDER BY added_at', [taskId]),
    db.query('SELECT * FROM work.checklists WHERE task_id = $1 ORDER BY order_index, created_at', [taskId]),
    db.query(
      `SELECT i.* FROM work.checklist_items i JOIN work.checklists c ON c.id = i.checklist_id
        WHERE c.task_id = $1 ORDER BY i.order_index, i.created_at`, [taskId]),
    db.query(
      `SELECT d.id AS dependency_id, p.id, p.name, p.custom_id, p.completed_at, st.name AS status_name, st.color AS status_color
         FROM work.task_dependencies d JOIN work.tasks p ON p.id = d.predecessor_id
         LEFT JOIN work.statuses st ON st.id = p.status_id
        WHERE d.successor_id = $1 AND p.deleted_at IS NULL`, [taskId]),
    db.query(
      `SELECT d.id AS dependency_id, sx.id, sx.name, sx.custom_id, sx.completed_at, st.name AS status_name, st.color AS status_color
         FROM work.task_dependencies d JOIN work.tasks sx ON sx.id = d.successor_id
         LEFT JOIN work.statuses st ON st.id = sx.status_id
        WHERE d.predecessor_id = $1 AND sx.deleted_at IS NULL`, [taskId]),
    db.query(
      `SELECT r.id AS relationship_id, x.id, x.name, x.custom_id, x.completed_at
         FROM work.task_relationships r JOIN work.tasks x ON x.id = CASE WHEN r.task_id = $1 THEN r.related_task_id ELSE r.task_id END
        WHERE (r.task_id = $1 OR r.related_task_id = $1) AND x.deleted_at IS NULL`, [taskId]),
    db.query('SELECT id, space_id, folder_id FROM work.lists WHERE id = $1', [task.list_id]),
    db.query(
      `SELECT m.list_id, l.name FROM work.task_list_memberships m JOIN work.lists l ON l.id = m.list_id
        WHERE m.task_id = $1`, [taskId]),
    db.query(
      `SELECT coalesce(sum(CASE WHEN ended_at IS NULL THEN EXTRACT(EPOCH FROM (now() - started_at))::int ELSE duration_seconds END), 0)::int AS seconds
         FROM work.time_entries WHERE task_id = $1`, [taskId])
  ])

  const itemsByChecklist = new Map<string, any[]>()
  for (const item of items.rows) {
    const bucket = itemsByChecklist.get(item.checklist_id) || []
    bucket.push(item)
    itemsByChecklist.set(item.checklist_id, bucket)
  }

  // Applicable custom fields + stored values.
  const fields = listRow.rows[0] ? await fieldsForList(workspaceId, listRow.rows[0], db) : []
  const values = fields.length
    ? await db.query('SELECT field_id, value FROM work.custom_field_values WHERE task_id = $1', [taskId])
    : { rows: [] as any[] }
  const valueByField = new Map(values.rows.map((v: any) => [v.field_id, v.value]))

  const subtasks = await db.query(
    `${TASK_SELECT} WHERE t.parent_id = $1 AND t.deleted_at IS NULL ORDER BY t.order_index, t.created_at`, [taskId])
  await attachSatellites(subtasks.rows, db)

  return {
    ...task,
    followers: followers.rows.map((f) => f.username),
    checklists: checklists.rows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) || [] })),
    waiting_on: waitingOn.rows,
    blocking: blocking.rows,
    related: related.rows,
    additional_lists: memberships.rows,
    custom_fields: fields.map((f) => ({
      id: f.id, name: f.name, field_type: f.field_type, required: f.required,
      config: f.config, options: f.options, scope_type: f.scope_type,
      value: valueByField.has(f.id) ? valueByField.get(f.id) : null
    })),
    subtasks: subtasks.rows,
    time_tracked_seconds: timeTotal.rows[0]?.seconds ?? 0
  }
}
