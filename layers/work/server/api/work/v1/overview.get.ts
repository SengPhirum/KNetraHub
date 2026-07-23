import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { visibleSpaceIds } from '~~/layers/work/server/utils/workAccess'

/** Home overview: my task buckets, workspace counts, recent activity, favorites. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const db = getWork()
  const spaceIds = await visibleSpaceIds(user, tier, workspaceId)

  const empty = { assigned: 0, due_today: 0, overdue: 0, done_this_week: 0 }
  const mine = spaceIds.length
    ? (await db.query(
        `SELECT
           count(*) FILTER (WHERE t.completed_at IS NULL)::int AS assigned,
           count(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at IS NOT NULL AND t.due_at::date = now()::date)::int AS due_today,
           count(*) FILTER (WHERE t.completed_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < now())::int AS overdue,
           count(*) FILTER (WHERE t.completed_at >= now() - interval '7 days')::int AS done_this_week
         FROM work.tasks t
         JOIN work.task_assignees a ON a.task_id = t.id AND lower(a.username) = lower($2)
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND t.space_id = ANY($3)`,
        [workspaceId, user.username, spaceIds])).rows[0]
    : empty

  const activity = spaceIds.length
    ? (await db.query(
        `SELECT a.id, a.entity_type, a.entity_id, a.task_id, a.actor, a.action, a.field, a.after_value, a.detail, a.ts,
                t.name AS task_name, t.custom_id
           FROM work.activity a
           LEFT JOIN work.tasks t ON t.id = a.task_id
          WHERE a.workspace_id = $1 AND (a.task_id IS NULL OR (t.deleted_at IS NULL AND t.space_id = ANY($2)))
          ORDER BY a.ts DESC LIMIT 20`,
        [workspaceId, spaceIds])).rows
    : []

  const favorites = (await db.query(
    `SELECT f.id, f.entity_type, f.entity_id, f.created_at,
            CASE f.entity_type
              WHEN 'space' THEN (SELECT name FROM work.spaces WHERE id = f.entity_id)
              WHEN 'folder' THEN (SELECT name FROM work.folders WHERE id = f.entity_id)
              WHEN 'list' THEN (SELECT name FROM work.lists WHERE id = f.entity_id)
              WHEN 'task' THEN (SELECT name FROM work.tasks WHERE id = f.entity_id)
              WHEN 'doc' THEN (SELECT title FROM work.docs WHERE id = f.entity_id)
              WHEN 'view' THEN (SELECT name FROM work.views WHERE id = f.entity_id)
            END AS name
       FROM work.favorites f
      WHERE f.workspace_id = $1 AND lower(f.username) = lower($2)
      ORDER BY f.created_at DESC LIMIT 20`,
    [workspaceId, user.username])).rows.filter((f) => f.name)

  const counts = (await db.query(
    `SELECT
       (SELECT count(*)::int FROM work.spaces WHERE workspace_id = $1 AND archived_at IS NULL AND id = ANY($2)) AS spaces,
       (SELECT count(*)::int FROM work.lists WHERE workspace_id = $1 AND archived_at IS NULL AND space_id = ANY($2)) AS lists,
       (SELECT count(*)::int FROM work.tasks WHERE workspace_id = $1 AND deleted_at IS NULL AND archived_at IS NULL AND completed_at IS NULL AND space_id = ANY($2)) AS open_tasks,
       (SELECT count(*)::int FROM work.docs WHERE workspace_id = $1 AND archived_at IS NULL) AS docs`,
    [workspaceId, spaceIds.length ? spaceIds : ['-']])).rows[0]

  return { me: mine, activity, favorites, counts, tier }
})
