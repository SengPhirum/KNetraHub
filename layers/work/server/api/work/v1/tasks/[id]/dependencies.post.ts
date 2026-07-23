import { getWork, newId, recordActivity, requestId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Add a dependency edge. body.direction 'waiting_on' makes this task wait on
 * body.task_id; 'blocking' makes body.task_id wait on this task. Cycles are
 * rejected by walking the predecessor graph.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  const { task } = await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const body = await readBody(event)
  const otherId = String(body?.task_id || '')
  if (!otherId || otherId === taskId) throw createError({ statusCode: 400, statusMessage: 'A different task_id is required' })
  await assertTaskAccess(user, tier, workspaceId, otherId, 'edit')
  const direction = body?.direction === 'blocking' ? 'blocking' : 'waiting_on'
  const predecessorId = direction === 'waiting_on' ? otherId : taskId
  const successorId = direction === 'waiting_on' ? taskId : otherId
  const db = getWork()

  // Cycle check: the predecessor must not (transitively) wait on the successor.
  const cycle = await db.query(
    `WITH RECURSIVE up AS (
       SELECT predecessor_id FROM work.task_dependencies WHERE successor_id = $1
       UNION
       SELECT d.predecessor_id FROM work.task_dependencies d JOIN up ON d.successor_id = up.predecessor_id
     ) SELECT 1 FROM up WHERE predecessor_id = $2 LIMIT 1`,
    [predecessorId, successorId])
  if (cycle.rows.length) throw createError({ statusCode: 400, statusMessage: 'That dependency would create a cycle' })

  const id = newId()
  await db.query(
    `INSERT INTO work.task_dependencies (id, workspace_id, predecessor_id, successor_id, created_by)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (predecessor_id, successor_id) DO NOTHING`,
    [id, workspaceId, predecessorId, successorId, user.username])
  await recordActivity(db, {
    workspaceId, entityType: 'task', entityId: taskId, taskId, actor: user.username,
    action: 'dependency_added', detail: `${direction} ${otherId}`, requestId: requestId(event)
  })
  return { id, predecessor_id: predecessorId, successor_id: successorId }
})
