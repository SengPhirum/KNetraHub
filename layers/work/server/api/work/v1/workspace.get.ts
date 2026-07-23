import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'

/** The (single, organization-default) workspace + the caller's effective tier. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const db = getWork()
  const { rows } = await db.query('SELECT id, name, slug, description, created_at, updated_at FROM work.workspaces WHERE id = $1', [workspaceId])
  if (!rows.length) throw createError({ statusCode: 500, statusMessage: 'Default workspace missing — re-run module initialization' })
  const counts = await db.query(
    `SELECT
       (SELECT count(*)::int FROM work.spaces WHERE workspace_id = $1 AND archived_at IS NULL) AS spaces,
       (SELECT count(*)::int FROM work.tasks WHERE workspace_id = $1 AND deleted_at IS NULL AND archived_at IS NULL) AS tasks,
       (SELECT count(*)::int FROM work.workspace_members WHERE workspace_id = $1) AS members,
       (SELECT count(*)::int FROM work.docs WHERE workspace_id = $1 AND archived_at IS NULL) AS docs`,
    [workspaceId]
  )
  return { ...rows[0], tier, me: user.username, counts: counts.rows[0] }
})
