import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'

/** Workspace members (for assignee/mention pickers). Any Work viewer may list. */
export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireWork(event)
  const { rows } = await getWork().query(
    `SELECT username, display_name, tier, joined_at, last_seen_at
       FROM work.workspace_members WHERE workspace_id = $1 ORDER BY lower(coalesce(display_name, username))`,
    [workspaceId]
  )
  return rows
})
