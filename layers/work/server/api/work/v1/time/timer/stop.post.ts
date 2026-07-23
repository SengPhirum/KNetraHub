import { getWork, optionalText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'

/** Stop the caller's running timer, fixing its duration. */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWorkPermission(event, 'work.time')
  const body = await readBody(event).catch(() => ({}))
  const { rows } = await getWork().query(
    `UPDATE work.time_entries
        SET ended_at = now(),
            duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::int,
            note = coalesce($3, note),
            billable = coalesce($4, billable),
            updated_at = now(), updated_by = $2
      WHERE workspace_id = $1 AND lower(username) = lower($2) AND ended_at IS NULL
      RETURNING id, task_id, duration_seconds`,
    [workspaceId, user.username, optionalText(body?.note, 'Note', 500),
      typeof body?.billable === 'boolean' ? body.billable : null])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'No running timer' })
  return rows[0]
})
