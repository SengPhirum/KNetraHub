import {
  getWork, nowIso, optionalColor, optionalText, recordActivity, requestId,
  requireText, requireWorkPermission, workAudit
} from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/

/** Update a space (rename, color, privacy, prefix, archive/restore). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const spaceId = String(getRouterParam(event, 'id'))
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'full')
  const body = await readBody(event)
  const db = getWork()

  if (body?.version !== undefined && Number(body.version) !== space.version) {
    throw createError({ statusCode: 409, statusMessage: 'This space was changed by someone else. Reload and retry.' })
  }

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }

  if (body?.name !== undefined) {
    const name = requireText(body.name, 'Space name', 120)
    const dup = await db.query(
      'SELECT 1 FROM work.spaces WHERE workspace_id = $1 AND lower(name) = lower($2) AND id <> $3 AND archived_at IS NULL',
      [workspaceId, name, spaceId])
    if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A space named "${name}" already exists` })
    set('name', name)
  }
  if (body?.description !== undefined) set('description', optionalText(body.description, 'Description', 2000))
  if (body?.icon !== undefined) set('icon', optionalText(body.icon, 'Icon', 60))
  if (body?.color !== undefined) set('color', optionalColor(body.color))
  if (body?.order_index !== undefined && Number.isFinite(Number(body.order_index))) set('order_index', Number(body.order_index))
  if (body?.task_prefix !== undefined) {
    let prefix: string | null = null
    if (body.task_prefix) {
      prefix = String(body.task_prefix).trim().toUpperCase()
      if (!PREFIX_RE.test(prefix)) throw createError({ statusCode: 400, statusMessage: 'Task ID prefix must be 1-10 characters: a letter followed by letters/digits' })
      const dup = await db.query(
        'SELECT 1 FROM work.spaces WHERE workspace_id = $1 AND task_prefix = $2 AND id <> $3 AND archived_at IS NULL',
        [workspaceId, prefix, spaceId])
      if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `Task ID prefix "${prefix}" is already in use` })
    }
    set('task_prefix', prefix)
  }
  if (body?.private !== undefined) {
    set('private', body.private === true)
    await workAudit(user, body.private ? 'space.made_private' : 'space.made_public', spaceId, space.name)
  }
  if (body?.archived !== undefined) {
    set('archived_at', body.archived ? nowIso() : null)
    await workAudit(user, body.archived ? 'space.archived' : 'space.restored', spaceId, space.name)
  }
  if (!sets.length) return { id: spaceId, version: space.version }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(spaceId)
  const { rows } = await db.query(`UPDATE work.spaces SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
  await recordActivity(db, {
    workspaceId, entityType: 'space', entityId: spaceId, actor: user.username,
    action: 'updated', detail: space.name, requestId: requestId(event)
  })
  return { id: spaceId, version: rows[0].version }
})
