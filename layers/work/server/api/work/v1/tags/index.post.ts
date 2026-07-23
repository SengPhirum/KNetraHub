import { getWork, newId, optionalColor, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Create a tag in a space. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.create')
  const body = await readBody(event)
  const spaceId = String(body?.space_id || '')
  await assertSpaceAccess(user, tier, workspaceId, spaceId, 'edit')
  const name = requireText(body?.name, 'Tag name', 60)
  const color = optionalColor(body?.color, '#6b7280')

  const db = getWork()
  const dup = await db.query('SELECT id FROM work.tags WHERE space_id = $1 AND lower(name) = lower($2)', [spaceId, name])
  if (dup.rows.length) return { id: dup.rows[0].id, existing: true }
  const id = newId()
  await db.query(
    'INSERT INTO work.tags (id, workspace_id, space_id, name, color, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, workspaceId, spaceId, name, color, user.username])
  return { id }
})
