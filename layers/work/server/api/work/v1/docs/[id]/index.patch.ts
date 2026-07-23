import { getWork, nowIso, optionalText, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Update a doc (title, icon, space, archive/restore). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const docId = String(getRouterParam(event, 'id'))
  const { doc } = await assertDocAccess(user, tier, workspaceId, docId, 'edit')
  const body = await readBody(event)

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }
  if (body?.title !== undefined) set('title', requireText(body.title, 'Doc title', 200))
  if (body?.icon !== undefined) set('icon', optionalText(body.icon, 'Icon', 60))
  if (body?.space_id !== undefined) {
    let spaceId: string | null = null
    if (body.space_id) {
      const { space } = await assertSpaceAccess(user, tier, workspaceId, String(body.space_id), 'edit')
      spaceId = space.id
    }
    set('space_id', spaceId)
  }
  if (body?.archived !== undefined) set('archived_at', body.archived ? nowIso() : null)
  if (!sets.length) return { id: docId, version: doc.version }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(docId)
  const { rows } = await getWork().query(`UPDATE work.docs SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
  return { id: docId, version: rows[0].version }
})
