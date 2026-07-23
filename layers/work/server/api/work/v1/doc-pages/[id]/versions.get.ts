import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** Version history for a page (metadata; pass ?content=true for bodies). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const pageId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT doc_id FROM work.doc_pages WHERE id = $1', [pageId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  await assertDocAccess(user, tier, workspaceId, rows[0].doc_id)
  const withContent = getQuery(event).content === 'true'
  const { rows: versions } = await db.query(
    `SELECT version, title, saved_at, saved_by${withContent ? ', content' : ''}
       FROM work.doc_page_versions WHERE page_id = $1 ORDER BY version DESC LIMIT 100`, [pageId])
  return versions
})
