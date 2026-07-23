import { recordActivity, requestId, requireWorkPermission, withWorkTx } from '~~/layers/work/server/utils/workStore'
import { assertListAccess } from '~~/layers/work/server/utils/workAccess'
import { replaceStatuses } from '~~/layers/work/server/utils/workStatuses'

/**
 * Set a list-level status override (full ordered set), or clear it back to
 * the space default with {"statuses": null} — clearing remaps tasks onto the
 * space set by (case-insensitive) name, else the space's first status.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const listId = String(getRouterParam(event, 'id'))
  const { list } = await assertListAccess(user, tier, workspaceId, listId, 'full')
  const body = await readBody(event)

  if (body?.statuses === null) {
    return withWorkTx(async (client) => {
      const override = await client.query('SELECT * FROM work.statuses WHERE list_id = $1', [listId])
      if (!override.rows.length) return { statuses: [], cleared: true, remapped: 0 }
      const spaceSet = (await client.query(
        'SELECT * FROM work.statuses WHERE space_id = $1 AND list_id IS NULL ORDER BY order_index', [list.space_id])).rows
      if (!spaceSet.length) throw createError({ statusCode: 409, statusMessage: 'The space has no default statuses to fall back to' })
      let remapped = 0
      for (const status of override.rows) {
        const match = spaceSet.find((s) => s.name.toLowerCase() === status.name.toLowerCase()) || spaceSet[0]
        const { rowCount } = await client.query(
          'UPDATE work.tasks SET status_id = $1, updated_at = now() WHERE status_id = $2', [match.id, status.id])
        remapped += rowCount || 0
      }
      await client.query('DELETE FROM work.statuses WHERE list_id = $1', [listId])
      await recordActivity(client, {
        workspaceId, entityType: 'list', entityId: listId, actor: user.username,
        action: 'statuses_cleared', detail: `${remapped} task(s) remapped to space statuses`, requestId: requestId(event)
      })
      return { statuses: spaceSet, cleared: true, remapped }
    })
  }

  return replaceStatuses({
    user, workspaceId, spaceId: list.space_id, listId,
    entries: body?.statuses, force: body?.force === true, requestId: requestId(event)
  })
})
