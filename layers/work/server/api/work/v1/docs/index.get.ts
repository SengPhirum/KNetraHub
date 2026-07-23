import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { visibleSpaceIds } from '~~/layers/work/server/utils/workAccess'

/** Docs hub: visible docs with page counts and last edit. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const q = getQuery(event)
  const includeArchived = q.archived === 'true'
  const spaceIds = await visibleSpaceIds(user, tier, workspaceId)
  const { rows } = await getWork().query(
    `SELECT d.*, s.name AS space_name,
            (SELECT count(*)::int FROM work.doc_pages p WHERE p.doc_id = d.id) AS page_count,
            (SELECT max(p.updated_at) FROM work.doc_pages p WHERE p.doc_id = d.id) AS last_edited_at
       FROM work.docs d LEFT JOIN work.spaces s ON s.id = d.space_id
      WHERE d.workspace_id = $1 ${includeArchived ? '' : 'AND d.archived_at IS NULL'}
        AND (d.space_id IS NULL OR d.space_id = ANY($2))
      ORDER BY coalesce((SELECT max(p.updated_at) FROM work.doc_pages p WHERE p.doc_id = d.id), d.updated_at) DESC
      LIMIT 200`,
    [workspaceId, spaceIds.length ? spaceIds : ['-']])
  return rows
})
