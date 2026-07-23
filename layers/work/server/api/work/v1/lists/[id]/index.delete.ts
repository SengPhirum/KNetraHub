import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertListAccess } from '~~/layers/work/server/utils/workAccess'

/** Permanently delete a list and its tasks (admin: work.delete, name confirm). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.delete')
  const listId = String(getRouterParam(event, 'id'))
  const { list } = await assertListAccess(user, tier, workspaceId, listId, 'full')
  const body = await readBody(event).catch(() => ({}))
  if (String(body?.confirm_name || '') !== list.name) {
    throw createError({ statusCode: 400, statusMessage: 'Type the exact list name in confirm_name to permanently delete it' })
  }
  const db = getWork()
  const impact = await db.query('SELECT count(*)::int AS n FROM work.tasks WHERE list_id = $1', [listId])
  await db.query('DELETE FROM work.lists WHERE id = $1 AND workspace_id = $2', [listId, workspaceId])
  await workAudit(user, 'list.deleted', listId, `${list.name} (${impact.rows[0].n} task(s) permanently removed)`)
  return { deleted: true, tasks: impact.rows[0].n }
})
