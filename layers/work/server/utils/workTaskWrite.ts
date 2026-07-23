import type { PoolClient } from 'pg'
import type { SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'
import {
  newId, nowIso, recordActivity, withWorkTx, workNotify,
  optionalDate, optionalPriority, optionalText, requireText, usernameList
} from './workStore'
import { assertListAccess, assertSpaceAccess, type TaskRow } from './workAccess'
import { effectiveStatuses } from './workTasks'
import { fieldsForList, validateFieldValue, type CustomFieldRow } from './workFields'

/**
 * Task mutations. Every write runs in one transaction with its activity rows,
 * bumps the optimistic-concurrency version, and never trusts client-supplied
 * ids without re-checking workspace + space access. Assignment changes fan
 * out portal notifications (best-effort, after commit).
 */

export const MAX_SUBTASK_DEPTH = 7

interface Ctx { user: SessionUser; tier: AppTier; workspaceId: string; requestId?: string | null }

async function nextSequence(client: PoolClient, spaceId: string): Promise<number> {
  await client.query('INSERT INTO work.task_sequences (space_id) VALUES ($1) ON CONFLICT DO NOTHING', [spaceId])
  const { rows } = await client.query(
    'UPDATE work.task_sequences SET next_number = next_number + 1 WHERE space_id = $1 RETURNING next_number - 1 AS n', [spaceId])
  return Number(rows[0].n)
}

async function statusFor(client: PoolClient, list: { id: string; space_id: string }, statusId: unknown): Promise<string | null> {
  const statuses = await effectiveStatuses(list, client)
  if (statusId === undefined || statusId === null || statusId === '') {
    return statuses[0]?.id ?? null
  }
  const match = statuses.find((s) => s.id === String(statusId))
  if (!match) throw createError({ statusCode: 400, statusMessage: 'Status does not belong to this list' })
  return match.id
}

async function taskDepth(client: PoolClient, taskId: string | null): Promise<number> {
  if (!taskId) return 0
  const { rows } = await client.query(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, 1 AS depth FROM work.tasks WHERE id = $1
       UNION ALL
       SELECT t.id, t.parent_id, up.depth + 1 FROM work.tasks t JOIN up ON t.id = up.parent_id
       WHERE up.depth < 50
     ) SELECT max(depth) AS depth FROM up`, [taskId])
  return Number(rows[0]?.depth || 0)
}

async function subtreeIds(client: PoolClient, rootId: string): Promise<string[]> {
  const { rows } = await client.query(
    `WITH RECURSIVE down AS (
       SELECT id FROM work.tasks WHERE id = $1
       UNION ALL
       SELECT t.id FROM work.tasks t JOIN down ON t.parent_id = down.id
     ) SELECT id FROM down`, [rootId])
  return rows.map((r) => r.id)
}

async function validTagIds(client: PoolClient, spaceId: string, raw: unknown): Promise<string[]> {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw createError({ statusCode: 400, statusMessage: 'tags must be an array of tag ids' })
  const ids = [...new Set(raw.map(String))].slice(0, 30)
  if (!ids.length) return []
  const { rows } = await client.query('SELECT id FROM work.tags WHERE space_id = $1 AND id = ANY($2)', [spaceId, ids])
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: 'One or more tags do not belong to this space' })
  return ids
}

function estimateMinutes(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 60 * 24 * 365) {
    throw createError({ statusCode: 400, statusMessage: 'Time estimate must be a non-negative number of minutes' })
  }
  return n
}

export interface CreateTaskInput {
  listId: string
  name: string
  description?: unknown
  parentId?: unknown
  typeId?: unknown
  statusId?: unknown
  priority?: unknown
  startAt?: unknown
  dueAt?: unknown
  allDay?: unknown
  timeEstimateMinutes?: unknown
  assignees?: unknown
  tags?: unknown
  source?: string
}

export async function createTask(ctx: Ctx, input: CreateTaskInput): Promise<{ id: string; custom_id: string | null }> {
  const name = requireText(input.name, 'Task name', 500)
  const description = optionalText(input.description, 'Description', 100_000) ?? ''
  const priority = optionalPriority(input.priority)
  const startAt = optionalDate(input.startAt, 'Start date')
  const dueAt = optionalDate(input.dueAt, 'Due date')
  const estimate = estimateMinutes(input.timeEstimateMinutes)
  const assignees = usernameList(input.assignees, 'Assignees')
  const source = ['ui', 'api', 'duplicate', 'template', 'import', 'form', 'automation'].includes(String(input.source)) ? String(input.source) : 'ui'

  const result = await withWorkTx(async (client) => {
    let { list } = await assertListAccess(ctx.user, ctx.tier, ctx.workspaceId, String(input.listId), 'edit', client)

    // Subtasks live in their parent's list; inherit and enforce depth.
    let parentId: string | null = null
    if (input.parentId) {
      const { rows } = await client.query(
        'SELECT id, list_id, deleted_at FROM work.tasks WHERE id = $1 AND workspace_id = $2', [String(input.parentId), ctx.workspaceId])
      if (!rows.length || rows[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Parent task not found' })
      parentId = rows[0].id
      if (rows[0].list_id !== list.id) {
        const resolved = await assertListAccess(ctx.user, ctx.tier, ctx.workspaceId, rows[0].list_id, 'edit', client)
        list = resolved.list
      }
      const depth = await taskDepth(client, parentId)
      if (depth >= MAX_SUBTASK_DEPTH) {
        throw createError({ statusCode: 400, statusMessage: `Subtasks are limited to ${MAX_SUBTASK_DEPTH} levels` })
      }
    }

    const statusId = await statusFor(client, list, input.statusId)

    let typeId: string | null = null
    if (input.typeId) {
      const { rows } = await client.query('SELECT id FROM work.task_types WHERE id = $1 AND workspace_id = $2', [String(input.typeId), ctx.workspaceId])
      if (!rows.length) throw createError({ statusCode: 400, statusMessage: 'Unknown task type' })
      typeId = rows[0].id
    }

    const tagIds = await validTagIds(client, list.space_id, input.tags)

    const spaceRow = await client.query('SELECT task_prefix FROM work.spaces WHERE id = $1', [list.space_id])
    const seq = await nextSequence(client, list.space_id)
    const prefix = spaceRow.rows[0]?.task_prefix
    const customId = prefix ? `${prefix}-${seq}` : null

    const id = newId()
    await client.query(
      `INSERT INTO work.tasks
        (id, workspace_id, space_id, list_id, parent_id, type_id, custom_id, seq_number, name, description,
         status_id, priority, start_at, due_at, all_day, time_estimate_minutes, order_index, source, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)`,
      [id, ctx.workspaceId, list.space_id, list.id, parentId, typeId, customId, seq, name, description,
        statusId, priority, startAt, dueAt, input.allDay !== false, estimate, Date.now(), source, ctx.user.username]
    )

    for (const username of assignees) {
      await client.query(
        'INSERT INTO work.task_assignees (task_id, username, assigned_by) VALUES ($1,$2,$3)',
        [id, username, ctx.user.username])
      await client.query(
        'INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, username])
    }
    // Creator follows their task.
    await client.query(
      'INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [id, ctx.user.username.toLowerCase()])
    for (const tagId of tagIds) {
      await client.query('INSERT INTO work.task_tags (task_id, tag_id) VALUES ($1,$2)', [id, tagId])
    }

    await recordActivity(client, {
      workspaceId: ctx.workspaceId, entityType: 'task', entityId: id, taskId: id,
      actor: ctx.user.username, action: 'created', detail: name, requestId: ctx.requestId
    })
    return { id, custom_id: customId, assignees }
  })

  for (const username of result.assignees) {
    if (username !== ctx.user.username.toLowerCase()) {
      await workNotify({
        event: 'task_assigned', target: result.id,
        title: 'Task assigned', body: `${ctx.user.username} assigned "${name}" to ${username}`
      })
    }
  }
  return { id: result.id, custom_id: result.custom_id }
}

/**
 * Apply a whitelisted partial update. Returns the new version plus any
 * non-blocking warnings (e.g. completing a task that still waits on others).
 */
export async function patchTask(ctx: Ctx, taskId: string, body: Record<string, unknown>): Promise<{ id: string; version: number; warnings: string[] }> {
  const warnings: string[] = []
  const notifyAssigned: string[] = []
  let taskName = ''

  const version = await withWorkTx(async (client) => {
    const { rows } = await client.query('SELECT * FROM work.tasks WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [taskId, ctx.workspaceId])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    const task = rows[0] as TaskRow
    if (task.deleted_at && body.deleted !== false) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    await assertSpaceAccess(ctx.user, ctx.tier, ctx.workspaceId, task.space_id, 'edit', client)
    taskName = task.name

    if (body.version !== undefined && Number(body.version) !== task.version) {
      throw createError({ statusCode: 409, statusMessage: 'This task was changed by someone else. Reload and retry.' })
    }

    const sets: string[] = []
    const params: unknown[] = []
    const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }
    const log = (field: string, before: unknown, after: unknown, action = 'updated') =>
      recordActivity(client, {
        workspaceId: ctx.workspaceId, entityType: 'task', entityId: taskId, taskId,
        actor: ctx.user.username, action, field, before, after, requestId: ctx.requestId
      })

    let list = (await client.query('SELECT * FROM work.lists WHERE id = $1', [task.list_id])).rows[0]

    // ── Move to another list (cascades to the whole subtree) ────────────────
    if (body.list_id !== undefined && String(body.list_id) !== task.list_id) {
      const target = await assertListAccess(ctx.user, ctx.tier, ctx.workspaceId, String(body.list_id), 'edit', client)
      const ids = await subtreeIds(client, taskId)
      const crossSpace = target.list.space_id !== task.space_id

      await client.query('UPDATE work.tasks SET list_id = $1, space_id = $2, updated_at = now() WHERE id = ANY($3)',
        [target.list.id, target.list.space_id, ids])
      // Moving out of a parent's list detaches a subtask from its parent.
      if (task.parent_id) await client.query('UPDATE work.tasks SET parent_id = NULL WHERE id = $1', [taskId])
      // Drop an additional-list membership that now equals the home list.
      await client.query('DELETE FROM work.task_list_memberships WHERE task_id = ANY($1) AND list_id = $2', [ids, target.list.id])

      if (crossSpace) {
        // Remap statuses by (case-insensitive) name into the target set, else default.
        const targetStatuses = await effectiveStatuses(target.list, client)
        const fallback = targetStatuses[0]?.id ?? null
        const moved = await client.query(
          `SELECT t.id, st.name AS status_name FROM work.tasks t LEFT JOIN work.statuses st ON st.id = t.status_id WHERE t.id = ANY($1)`, [ids])
        for (const row of moved.rows) {
          const match = targetStatuses.find((s) => s.name.toLowerCase() === String(row.status_name || '').toLowerCase())
          await client.query('UPDATE work.tasks SET status_id = $1 WHERE id = $2', [match?.id ?? fallback, row.id])
        }
        // Tags are space-scoped: recreate same-name tags in the target space so
        // no labels are silently lost on a cross-space move.
        const tagRows = await client.query(
          `SELECT DISTINCT g.name, g.color FROM work.task_tags tt JOIN work.tags g ON g.id = tt.tag_id WHERE tt.task_id = ANY($1)`, [ids])
        for (const tag of tagRows.rows) {
          await client.query(
            `INSERT INTO work.tags (id, workspace_id, space_id, name, color, created_by)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (space_id, name) DO NOTHING`,
            [newId(), ctx.workspaceId, target.list.space_id, tag.name, tag.color, ctx.user.username])
        }
        await client.query(
          `UPDATE work.task_tags tt SET tag_id = ng.id
             FROM work.tags og, work.tags ng
            WHERE tt.tag_id = og.id AND tt.task_id = ANY($1)
              AND ng.space_id = $2 AND ng.name = og.name AND og.space_id <> $2`,
          [ids, target.list.space_id])
      }
      await log('list', list?.name, target.list.name, 'moved')
      task.list_id = target.list.id
      task.space_id = target.list.space_id
      list = target.list
    }

    if (body.name !== undefined) {
      const name = requireText(body.name, 'Task name', 500)
      if (name !== task.name) { set('name', name); await log('name', task.name, name); taskName = name }
    }
    if (body.description !== undefined) {
      const description = optionalText(body.description, 'Description', 100_000) ?? ''
      if (description !== task.description) { set('description', description); await log('description', null, null, 'updated') }
    }
    if (body.status_id !== undefined) {
      const statusId = await statusFor(client, list, body.status_id)
      if (statusId !== task.status_id) {
        const names = await client.query('SELECT id, name, status_group FROM work.statuses WHERE id = ANY($1)',
          [[task.status_id, statusId].filter(Boolean)])
        const before = names.rows.find((r) => r.id === task.status_id)
        const after = names.rows.find((r) => r.id === statusId)
        set('status_id', statusId)
        const nowDone = after && ['done', 'closed'].includes(after.status_group)
        set('completed_at', nowDone ? nowIso() : null)
        if (nowDone) {
          const open = await client.query(
            `SELECT count(*)::int AS n FROM work.task_dependencies d JOIN work.tasks p ON p.id = d.predecessor_id
              WHERE d.successor_id = $1 AND p.deleted_at IS NULL AND p.completed_at IS NULL`, [taskId])
          if (open.rows[0].n > 0) warnings.push(`This task is still waiting on ${open.rows[0].n} incomplete task(s).`)
        }
        await log('status', before?.name ?? null, after?.name ?? null)
      }
    }
    if (body.priority !== undefined) {
      const priority = optionalPriority(body.priority)
      if (priority !== task.priority) { set('priority', priority); await log('priority', task.priority, priority) }
    }
    if (body.start_at !== undefined) {
      const startAt = optionalDate(body.start_at, 'Start date')
      set('start_at', startAt); await log('start_at', task.start_at, startAt)
    }
    if (body.due_at !== undefined) {
      const dueAt = optionalDate(body.due_at, 'Due date')
      set('due_at', dueAt); await log('due_at', task.due_at, dueAt)
    }
    if (body.all_day !== undefined) set('all_day', body.all_day !== false)
    if (body.time_estimate_minutes !== undefined) {
      const estimate = estimateMinutes(body.time_estimate_minutes)
      if (estimate !== task.time_estimate_minutes) { set('time_estimate_minutes', estimate); await log('estimate', task.time_estimate_minutes, estimate) }
    }
    if (body.type_id !== undefined) {
      let typeId: string | null = null
      if (body.type_id) {
        const { rows: tr } = await client.query('SELECT id FROM work.task_types WHERE id = $1 AND workspace_id = $2', [String(body.type_id), ctx.workspaceId])
        if (!tr.length) throw createError({ statusCode: 400, statusMessage: 'Unknown task type' })
        typeId = tr[0].id
      }
      if (typeId !== task.type_id) { set('type_id', typeId); await log('type', task.type_id, typeId) }
    }
    if (body.order_index !== undefined) {
      const order = Number(body.order_index)
      if (!Number.isFinite(order)) throw createError({ statusCode: 400, statusMessage: 'order_index must be a number' })
      set('order_index', order)
    }
    if (body.parent_id !== undefined) {
      let parentId: string | null = null
      if (body.parent_id) {
        const candidate = String(body.parent_id)
        if (candidate === taskId) throw createError({ statusCode: 400, statusMessage: 'A task cannot be its own parent' })
        const { rows: pr } = await client.query(
          'SELECT id, list_id, deleted_at FROM work.tasks WHERE id = $1 AND workspace_id = $2', [candidate, ctx.workspaceId])
        if (!pr.length || pr[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Parent task not found' })
        if (pr[0].list_id !== task.list_id) throw createError({ statusCode: 400, statusMessage: 'Parent must be in the same list' })
        const descendants = await subtreeIds(client, taskId)
        if (descendants.includes(candidate)) throw createError({ statusCode: 400, statusMessage: 'Cannot nest a task under its own subtask' })
        const depth = await taskDepth(client, candidate)
        if (depth >= MAX_SUBTASK_DEPTH) throw createError({ statusCode: 400, statusMessage: `Subtasks are limited to ${MAX_SUBTASK_DEPTH} levels` })
        parentId = candidate
      }
      if (parentId !== task.parent_id) { set('parent_id', parentId); await log('parent', task.parent_id, parentId) }
    }
    if (body.archived !== undefined) {
      const archivedAt = body.archived ? nowIso() : null
      if (!!archivedAt !== !!task.archived_at) {
        set('archived_at', archivedAt)
        await log('archived', !!task.archived_at, !!archivedAt, body.archived ? 'archived' : 'unarchived')
      }
    }
    if (body.deleted === false && task.deleted_at) {
      const ids = await subtreeIds(client, taskId)
      await client.query('UPDATE work.tasks SET deleted_at = NULL WHERE id = ANY($1)', [ids])
      await log('deleted', true, false, 'restored')
    }

    // ── Satellite sets (full replacement semantics) ─────────────────────────
    if (body.assignees !== undefined) {
      const next = usernameList(body.assignees, 'Assignees')
      const current = (await client.query('SELECT username FROM work.task_assignees WHERE task_id = $1', [taskId])).rows.map((r) => r.username)
      const added = next.filter((u) => !current.includes(u))
      const removed = current.filter((u) => !next.includes(u))
      for (const username of removed) {
        await client.query('DELETE FROM work.task_assignees WHERE task_id = $1 AND username = $2', [taskId, username])
      }
      for (const username of added) {
        await client.query('INSERT INTO work.task_assignees (task_id, username, assigned_by) VALUES ($1,$2,$3)', [taskId, username, ctx.user.username])
        await client.query('INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, username])
        if (username !== ctx.user.username.toLowerCase()) notifyAssigned.push(username)
      }
      if (added.length || removed.length) await log('assignees', current.join(', '), next.join(', '))
    }
    if (body.tags !== undefined) {
      const next = await validTagIds(client, task.space_id, body.tags)
      const current = (await client.query('SELECT tag_id FROM work.task_tags WHERE task_id = $1', [taskId])).rows.map((r) => r.tag_id)
      if ([...next].sort().join() !== [...current].sort().join()) {
        await client.query('DELETE FROM work.task_tags WHERE task_id = $1', [taskId])
        for (const tagId of next) await client.query('INSERT INTO work.task_tags (task_id, tag_id) VALUES ($1,$2)', [taskId, tagId])
        await log('tags', current.length, next.length)
      }
    }
    if (body.follow !== undefined) {
      if (body.follow) {
        await client.query('INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, ctx.user.username.toLowerCase()])
      } else {
        await client.query('DELETE FROM work.task_followers WHERE task_id = $1 AND lower(username) = lower($2)', [taskId, ctx.user.username])
      }
    }
    if (body.custom_fields !== undefined) {
      if (typeof body.custom_fields !== 'object' || Array.isArray(body.custom_fields)) {
        throw createError({ statusCode: 400, statusMessage: 'custom_fields must be an object of fieldId → value' })
      }
      const applicable = await fieldsForList(ctx.workspaceId, list, client)
      for (const [fieldId, raw] of Object.entries(body.custom_fields as Record<string, unknown>)) {
        const field = applicable.find((f: CustomFieldRow) => f.id === fieldId)
        if (!field) throw createError({ statusCode: 400, statusMessage: 'Custom field does not apply to this task' })
        const value = validateFieldValue(field, raw)
        if (value === null) {
          await client.query('DELETE FROM work.custom_field_values WHERE task_id = $1 AND field_id = $2', [taskId, fieldId])
        } else {
          await client.query(
            `INSERT INTO work.custom_field_values (task_id, field_id, value, updated_by)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (task_id, field_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [taskId, fieldId, JSON.stringify(value), ctx.user.username])
        }
        await log(`field:${field.name}`, null, value === null ? null : JSON.stringify(value))
      }
    }

    // Single authoritative UPDATE: version bump + audit columns.
    params.push(ctx.user.username)
    sets.push(`updated_by = $${params.length}`)
    sets.push('updated_at = now()', 'version = version + 1')
    params.push(taskId)
    const updated = await client.query(
      `UPDATE work.tasks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
    return Number(updated.rows[0].version)
  })

  for (const username of notifyAssigned) {
    await workNotify({
      event: 'task_assigned', target: taskId,
      title: 'Task assigned', body: `${ctx.user.username} assigned "${taskName}" to ${username}`
    })
  }
  return { id: taskId, version, warnings }
}

/** Soft-delete a task and its whole subtree. */
export async function softDeleteTask(ctx: Ctx, taskId: string): Promise<{ deleted: number }> {
  return withWorkTx(async (client) => {
    const { rows } = await client.query('SELECT * FROM work.tasks WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [taskId, ctx.workspaceId])
    if (!rows.length || rows[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    await assertSpaceAccess(ctx.user, ctx.tier, ctx.workspaceId, rows[0].space_id, 'edit', client)
    const ids = await subtreeIds(client, taskId)
    await client.query('UPDATE work.tasks SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE id = ANY($1)', [ids, ctx.user.username])
    await recordActivity(client, {
      workspaceId: ctx.workspaceId, entityType: 'task', entityId: taskId, taskId,
      actor: ctx.user.username, action: 'deleted', detail: rows[0].name, requestId: ctx.requestId
    })
    return { deleted: ids.length }
  })
}

/** Duplicate a task (and its subtree, checklists, tags, assignees, field values). */
export async function duplicateTask(ctx: Ctx, taskId: string): Promise<{ id: string }> {
  return withWorkTx(async (client) => {
    const { rows } = await client.query('SELECT * FROM work.tasks WHERE id = $1 AND workspace_id = $2', [taskId, ctx.workspaceId])
    if (!rows.length || rows[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    const root = rows[0] as TaskRow
    await assertSpaceAccess(ctx.user, ctx.tier, ctx.workspaceId, root.space_id, 'edit', client)

    const copyOne = async (sourceId: string, parentId: string | null, isRoot: boolean): Promise<string> => {
      const { rows: src } = await client.query('SELECT * FROM work.tasks WHERE id = $1', [sourceId])
      const source = src[0]
      const seq = await nextSequence(client, source.space_id)
      const prefixRow = await client.query('SELECT task_prefix FROM work.spaces WHERE id = $1', [source.space_id])
      const customId = prefixRow.rows[0]?.task_prefix ? `${prefixRow.rows[0].task_prefix}-${seq}` : null
      const id = newId()
      await client.query(
        `INSERT INTO work.tasks
          (id, workspace_id, space_id, list_id, parent_id, type_id, custom_id, seq_number, name, description,
           status_id, priority, start_at, due_at, all_day, time_estimate_minutes, order_index, source, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'duplicate',$18,$18)`,
        [id, source.workspace_id, source.space_id, source.list_id, parentId, source.type_id, customId, seq,
          isRoot ? `${source.name} (copy)` : source.name, source.description, source.status_id, source.priority,
          source.start_at, source.due_at, source.all_day, source.time_estimate_minutes, Date.now(), ctx.user.username]
      )
      await client.query(
        `INSERT INTO work.task_assignees (task_id, username, assigned_by)
         SELECT $1, username, $2 FROM work.task_assignees WHERE task_id = $3`, [id, ctx.user.username, sourceId])
      await client.query(
        'INSERT INTO work.task_tags (task_id, tag_id) SELECT $1, tag_id FROM work.task_tags WHERE task_id = $2', [id, sourceId])
      await client.query(
        `INSERT INTO work.custom_field_values (task_id, field_id, value, updated_by)
         SELECT $1, field_id, value, $2 FROM work.custom_field_values WHERE task_id = $3`, [id, ctx.user.username, sourceId])
      const checklists = await client.query('SELECT * FROM work.checklists WHERE task_id = $1 ORDER BY order_index', [sourceId])
      for (const cl of checklists.rows) {
        const clId = newId()
        await client.query(
          'INSERT INTO work.checklists (id, task_id, name, order_index, created_by) VALUES ($1,$2,$3,$4,$5)',
          [clId, id, cl.name, cl.order_index, ctx.user.username])
        const clItems = await client.query(
          'SELECT name, assignee, order_index FROM work.checklist_items WHERE checklist_id = $1 ORDER BY order_index', [cl.id])
        for (const item of clItems.rows) {
          await client.query(
            'INSERT INTO work.checklist_items (id, checklist_id, name, done, assignee, order_index, created_by) VALUES ($1,$2,$3,false,$4,$5,$6)',
            [newId(), clId, item.name, item.assignee, item.order_index, ctx.user.username])
        }
      }
      const children = await client.query(
        'SELECT id FROM work.tasks WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY order_index, created_at', [sourceId])
      for (const child of children.rows) await copyOne(child.id, id, false)
      return id
    }

    const newRootId = await copyOne(taskId, null, true)
    await client.query(
      'INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [newRootId, ctx.user.username.toLowerCase()])
    await recordActivity(client, {
      workspaceId: ctx.workspaceId, entityType: 'task', entityId: newRootId, taskId: newRootId,
      actor: ctx.user.username, action: 'duplicated', detail: `from ${root.custom_id || root.id}`, requestId: ctx.requestId
    })
    return { id: newRootId }
  })
}
