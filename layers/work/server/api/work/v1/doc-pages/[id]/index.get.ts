import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** A doc page with its content. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const pageId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.doc_pages WHERE id = $1', [pageId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  await assertDocAccess(user, tier, workspaceId, rows[0].doc_id)
  return rows[0]
})
