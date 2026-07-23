import { getWork, optionalColor, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Rename/recolor a tag. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const tagId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.tags WHERE id = $1 AND workspace_id = $2', [tagId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  await assertSpaceAccess(user, tier, workspaceId, rows[0].space_id, 'edit')
  const body = await readBody(event)

  const name = body?.name !== undefined ? requireText(body.name, 'Tag name', 60) : rows[0].name
  const color = body?.color !== undefined ? optionalColor(body.color, rows[0].color) : rows[0].color
  const dup = await db.query(
    'SELECT 1 FROM work.tags WHERE space_id = $1 AND lower(name) = lower($2) AND id <> $3', [rows[0].space_id, name, tagId])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A tag named "${name}" already exists in this space` })
  await db.query('UPDATE work.tags SET name = $2, color = $3 WHERE id = $1', [tagId, name, color])
  return { id: tagId }
})
