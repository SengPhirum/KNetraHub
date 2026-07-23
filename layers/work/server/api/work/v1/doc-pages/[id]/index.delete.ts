import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** Delete a doc page (and its nested pages/versions). The last page cannot go. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const pageId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.doc_pages WHERE id = $1', [pageId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  await assertDocAccess(user, tier, workspaceId, rows[0].doc_id, 'edit')
  const siblings = await db.query('SELECT count(*)::int AS n FROM work.doc_pages WHERE doc_id = $1', [rows[0].doc_id])
  if (siblings.rows[0].n <= 1) throw createError({ statusCode: 400, statusMessage: 'A doc keeps at least one page — delete the doc instead' })
  await db.query('DELETE FROM work.doc_pages WHERE id = $1', [pageId])
  return { deleted: true }
})
