import {
  newId, optionalColor, optionalText, recordActivity, requestId,
  requireText, requireWorkPermission, withWorkTx, workAudit
} from '~~/layers/work/server/utils/workStore'
import { seedDefaultStatuses } from '~~/layers/work/server/utils/workStatuses'

const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/

/** Create a space (operator: work.create). Seeds the default status workflow. */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  const name = requireText(body?.name, 'Space name', 120)
  const description = optionalText(body?.description, 'Description', 2000)
  const color = optionalColor(body?.color)
  const isPrivate = body?.private === true

  let prefix: string | null = null
  if (body?.task_prefix) {
    prefix = String(body.task_prefix).trim().toUpperCase()
    if (!PREFIX_RE.test(prefix)) {
      throw createError({ statusCode: 400, statusMessage: 'Task ID prefix must be 1-10 characters: a letter followed by letters/digits' })
    }
  }

  const id = newId()
  await withWorkTx(async (client) => {
    const dup = await client.query(
      'SELECT 1 FROM work.spaces WHERE workspace_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL', [workspaceId, name])
    if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A space named "${name}" already exists` })
    if (prefix) {
      const dupPrefix = await client.query(
        'SELECT 1 FROM work.spaces WHERE workspace_id = $1 AND task_prefix = $2 AND archived_at IS NULL', [workspaceId, prefix])
      if (dupPrefix.rows.length) throw createError({ statusCode: 409, statusMessage: `Task ID prefix "${prefix}" is already in use` })
    }
    await client.query(
      `INSERT INTO work.spaces (id, workspace_id, name, description, icon, color, private, task_prefix, order_index, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [id, workspaceId, name, description, optionalText(body?.icon, 'Icon', 60), color, isPrivate, prefix, Date.now(), user.username]
    )
    await seedDefaultStatuses(client, workspaceId, id)
    await recordActivity(client, {
      workspaceId, entityType: 'space', entityId: id, actor: user.username,
      action: 'created', detail: name, requestId: requestId(event)
    })
  })
  if (isPrivate) await workAudit(user, 'space.private.created', id, name)
  return { id }
})
