import { getWork, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { sanitizeViewConfig } from '~~/layers/work/server/utils/workViews'

/** Update a saved view (owner; shared views also by managers). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const viewId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.views WHERE id = $1 AND workspace_id = $2', [viewId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'View not found' })
  const view = rows[0]
  const isManager = tier === 'manager' || tier === 'admin'
  const isOwner = view.owner.toLowerCase() === user.username.toLowerCase()
  if (!isOwner && !(isManager && !view.is_private)) {
    throw createError({ statusCode: 403, statusMessage: 'Only the owner (or a manager, for shared views) can edit this view' })
  }
  const body = await readBody(event)

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }
  if (body?.name !== undefined) set('name', requireText(body.name, 'View name', 100))
  if (body?.config !== undefined) set('config', JSON.stringify(sanitizeViewConfig(body.config)))
  if (body?.order_index !== undefined && Number.isFinite(Number(body.order_index))) set('order_index', Number(body.order_index))
  if (body?.is_private !== undefined) {
    if (body.is_private === false && !isManager) {
      throw createError({ statusCode: 403, statusMessage: 'Sharing a view with everyone requires manager access' })
    }
    set('is_private', body.is_private !== false)
  }
  if (!sets.length) return { id: viewId }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(viewId)
  await db.query(`UPDATE work.views SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
  return { id: viewId }
})
