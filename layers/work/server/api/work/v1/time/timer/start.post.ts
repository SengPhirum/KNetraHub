import { getWork, newId, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Start the caller's timer on a task. One running timer per user — enforced
 * by a partial unique index, so a concurrent double-start loses cleanly.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.time')
  const body = await readBody(event)
  const taskId = String(body?.task_id || '')
  if (!taskId) throw createError({ statusCode: 400, statusMessage: 'task_id is required' })
  await assertTaskAccess(user, tier, workspaceId, taskId, 'edit')
  const id = newId()
  try {
    await getWork().query(
      `INSERT INTO work.time_entries (id, workspace_id, task_id, username, started_at, source, created_by)
       VALUES ($1,$2,$3,$4,now(),'timer',$4)`,
      [id, workspaceId, taskId, user.username.toLowerCase()])
  } catch (err: any) {
    if (String(err?.code) === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'You already have a running timer — stop it first' })
    }
    throw err
  }
  return { id }
})
