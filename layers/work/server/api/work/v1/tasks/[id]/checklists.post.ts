import { getWork, newId, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/** Add a checklist to a task. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.update')
  const taskId = String(getRouterParam(event, 'id'))
  await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const body = await readBody(event)
  const id = newId()
  await getWork().query(
    'INSERT INTO work.checklists (id, task_id, name, order_index, created_by) VALUES ($1,$2,$3,$4,$5)',
    [id, taskId, requireText(body?.name, 'Checklist name', 120), Date.now(), user.username])
  return { id }
})
