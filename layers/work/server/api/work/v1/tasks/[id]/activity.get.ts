import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** A task's activity trail, newest first. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId)
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const { rows } = await getWork().query(
    `SELECT id, actor, action, field, before_value, after_value, detail, ts
       FROM work.activity WHERE task_id = $1 ORDER BY ts DESC LIMIT ${limit}`, [taskId])
  return rows
})
