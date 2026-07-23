import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'

/** Workspace task types (Task, Milestone, Bug, …). */
export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireWork(event)
  const { rows } = await getWork().query(
    'SELECT * FROM work.task_types WHERE workspace_id = $1 ORDER BY order_index, name', [workspaceId])
  return rows
})
