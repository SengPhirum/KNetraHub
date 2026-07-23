import { getWork, newId, requireText, requireWorkPermission } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** Add a page (optionally nested under another page) to a doc. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const docId = String(getRouterParam(event, 'id'))
  await assertDocAccess(user, tier, workspaceId, docId, 'edit')
  const body = await readBody(event)
  const db = getWork()

  let parentPageId: string | null = null
  if (body?.parent_page_id) {
    const parent = await db.query('SELECT id FROM work.doc_pages WHERE id = $1 AND doc_id = $2', [String(body.parent_page_id), docId])
    if (!parent.rows.length) throw createError({ statusCode: 404, statusMessage: 'Parent page not found' })
    parentPageId = parent.rows[0].id
  }

  const id = newId()
  await db.query(
    `INSERT INTO work.doc_pages (id, doc_id, parent_page_id, title, content, order_index, created_by, updated_by)
     VALUES ($1,$2,$3,$4,'',$5,$6,$6)`,
    [id, docId, parentPageId, requireText(body?.title, 'Page title', 200), Date.now(), user.username])
  return { id }
})
