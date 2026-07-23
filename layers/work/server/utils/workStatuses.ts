import type { PoolClient } from 'pg'
import type { SessionUser } from '~~/server/utils/auth'
import { newId, optionalColor, recordActivity, requireText, withWorkTx } from './workStore'

/**
 * Status-workflow replacement shared by the space-level and list-level PUT
 * endpoints. The client sends the full ordered set; existing statuses are
 * matched by id (rename/recolor keeps task links), new ones are inserted,
 * and removed ones are only allowed when unused — or force=true remaps their
 * tasks to the first status of the new set (recorded in the activity trail).
 */

export const STATUS_GROUPS = ['open', 'active', 'done', 'closed'] as const

export interface StatusEntryInput { id?: string; name: string; color?: string; status_group?: string }

export async function replaceStatuses(opts: {
  user: SessionUser
  workspaceId: string
  spaceId: string
  listId: string | null
  entries: unknown
  force: boolean
  requestId?: string | null
}): Promise<{ statuses: any[]; remapped: number }> {
  if (!Array.isArray(opts.entries) || !opts.entries.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one status is required' })
  }
  if (opts.entries.length > 30) throw createError({ statusCode: 400, statusMessage: 'A workflow allows at most 30 statuses' })

  const seen = new Set<string>()
  const entries = (opts.entries as StatusEntryInput[]).map((entry, index) => {
    const name = requireText(entry?.name, 'Status name', 60)
    const key = name.toLowerCase()
    if (seen.has(key)) throw createError({ statusCode: 400, statusMessage: `Duplicate status name: ${name}` })
    seen.add(key)
    const group = STATUS_GROUPS.includes(entry?.status_group as any) ? String(entry.status_group) : 'active'
    return {
      id: typeof entry?.id === 'string' ? entry.id : null,
      name,
      color: optionalColor(entry?.color, '#6b7280')!,
      status_group: group,
      order_index: (index + 1) * 10
    }
  })

  return withWorkTx(async (client: PoolClient) => {
    const scope = opts.listId
      ? { where: 'list_id = $1', params: [opts.listId] }
      : { where: 'space_id = $1 AND list_id IS NULL', params: [opts.spaceId] }
    const existing = await client.query(`SELECT * FROM work.statuses WHERE ${scope.where} ORDER BY order_index`, scope.params)
    const keepIds = new Set(entries.map((e) => e.id).filter(Boolean))
    const removed = existing.rows.filter((row) => !keepIds.has(row.id))

    let remapped = 0
    if (removed.length) {
      const removedIds = removed.map((r) => r.id)
      const inUse = await client.query(
        'SELECT count(*)::int AS n FROM work.tasks WHERE status_id = ANY($1) AND deleted_at IS NULL', [removedIds])
      const usage = Number(inUse.rows[0].n)
      if (usage > 0 && !opts.force) {
        throw createError({
          statusCode: 409,
          statusMessage: `${usage} task(s) still use removed status(es). Retry with force=true to remap them to the first status.`
        })
      }
      if (usage > 0) remapped = usage
    }

    // Upsert kept/new statuses first so a remap target exists.
    const resultIds: string[] = []
    for (const entry of entries) {
      if (entry.id && existing.rows.some((row) => row.id === entry.id)) {
        await client.query(
          'UPDATE work.statuses SET name = $2, color = $3, status_group = $4, order_index = $5 WHERE id = $1',
          [entry.id, entry.name, entry.color, entry.status_group, entry.order_index])
        resultIds.push(entry.id)
      } else {
        const id = newId()
        await client.query(
          `INSERT INTO work.statuses (id, workspace_id, space_id, list_id, name, color, status_group, order_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, opts.workspaceId, opts.spaceId, opts.listId, entry.name, entry.color, entry.status_group, entry.order_index])
        resultIds.push(id)
      }
    }

    if (removed.length) {
      const removedIds = removed.map((r) => r.id)
      if (remapped > 0) {
        await client.query(
          'UPDATE work.tasks SET status_id = $1, updated_at = now() WHERE status_id = ANY($2) AND deleted_at IS NULL',
          [resultIds[0], removedIds])
      }
      await client.query('DELETE FROM work.statuses WHERE id = ANY($1)', [removedIds])
    }

    // Creating/replacing a LIST override: tasks in the list may still point at
    // space-level statuses, which are no longer part of its effective set.
    // Remap them into the override by (case-insensitive) name, else first.
    if (opts.listId) {
      const strays = await client.query(
        `SELECT t.id, st.name AS status_name FROM work.tasks t
           LEFT JOIN work.statuses st ON st.id = t.status_id
          WHERE t.list_id = $1 AND t.deleted_at IS NULL
            AND (t.status_id IS NULL OR st.list_id IS DISTINCT FROM $1)`, [opts.listId])
      if (strays.rows.length) {
        const named = new Map(entries.map((e, i) => [e.name.toLowerCase(), resultIds[i]!]))
        for (const stray of strays.rows) {
          const target = named.get(String(stray.status_name || '').toLowerCase()) || resultIds[0]
          await client.query('UPDATE work.tasks SET status_id = $1, updated_at = now() WHERE id = $2', [target, stray.id])
        }
        remapped += strays.rows.length
      }
    }

    await recordActivity(client, {
      workspaceId: opts.workspaceId,
      entityType: opts.listId ? 'list' : 'space',
      entityId: opts.listId || opts.spaceId,
      actor: opts.user.username,
      action: 'statuses_updated',
      detail: `${entries.length} status(es)${remapped ? `, ${remapped} task(s) remapped` : ''}`,
      requestId: opts.requestId
    })

    const { rows } = await client.query(`SELECT * FROM work.statuses WHERE ${scope.where} ORDER BY order_index`, scope.params)
    return { statuses: rows, remapped }
  })
}

/** Seed the default To Do / In Progress / Complete workflow for a new space. */
export async function seedDefaultStatuses(client: PoolClient, workspaceId: string, spaceId: string): Promise<void> {
  const defaults = [
    { name: 'To Do', color: '#9ca3af', status_group: 'open', order_index: 10 },
    { name: 'In Progress', color: '#3b82f6', status_group: 'active', order_index: 20 },
    { name: 'Complete', color: '#22c55e', status_group: 'done', order_index: 30 }
  ]
  for (const status of defaults) {
    await client.query(
      `INSERT INTO work.statuses (id, workspace_id, space_id, list_id, name, color, status_group, order_index)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7)`,
      [newId(), workspaceId, spaceId, status.name, status.color, status.status_group, status.order_index])
  }
}
