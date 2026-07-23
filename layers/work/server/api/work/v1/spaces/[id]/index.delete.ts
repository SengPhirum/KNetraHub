import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Permanently delete a space and everything in it (admin: work.delete).
 * Destructive — requires the client to echo the space name as confirmation;
 * archive (PATCH archived=true) is the reversible alternative.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.delete')
  const spaceId = String(getRouterParam(event, 'id'))
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'full')
  const body = await readBody(event).catch(() => ({}))
  if (String(body?.confirm_name || '') !== space.name) {
    throw createError({ statusCode: 400, statusMessage: 'Type the exact space name in confirm_name to permanently delete it' })
  }
  const db = getWork()
  const impact = await db.query(
    `SELECT (SELECT count(*)::int FROM work.tasks WHERE space_id = $1) AS tasks,
            (SELECT count(*)::int FROM work.lists WHERE space_id = $1) AS lists`, [spaceId])
  await db.query('DELETE FROM work.spaces WHERE id = $1 AND workspace_id = $2', [spaceId, workspaceId])
  await workAudit(user, 'space.deleted', spaceId,
    `${space.name} (${impact.rows[0].tasks} tasks, ${impact.rows[0].lists} lists permanently removed)`)
  return { deleted: true, tasks: impact.rows[0].tasks, lists: impact.rows[0].lists }
})
