import { getWork, newId, optionalText, requireText, requireWorkPermission, withWorkTx } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Save a doc page. Content/title saves append a version-history row and use
 * optimistic concurrency (version) so two editors never silently overwrite.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const pageId = String(getRouterParam(event, 'id'))
  const body = await readBody(event)

  return withWorkTx(async (client) => {
    const { rows } = await client.query('SELECT * FROM work.doc_pages WHERE id = $1 FOR UPDATE', [pageId])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
    const page = rows[0]
    await assertDocAccess(user, tier, workspaceId, page.doc_id, 'edit', client)

    if (body?.version !== undefined && Number(body.version) !== page.version) {
      throw createError({ statusCode: 409, statusMessage: 'This page was changed by someone else. Reload and merge your edits.' })
    }

    const title = body?.title !== undefined ? requireText(body.title, 'Page title', 200) : page.title
    const content = body?.content !== undefined ? String(optionalText(body.content, 'Content', 500_000) ?? '') : page.content
    const contentChanged = title !== page.title || content !== page.content

    if (contentChanged) {
      // Version the state being replaced, so v1 is always recoverable.
      await client.query(
        `INSERT INTO work.doc_page_versions (id, page_id, version, title, content, saved_by)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (page_id, version) DO NOTHING`,
        [newId(), pageId, page.version, page.title, page.content, page.updated_by || page.created_by])
    }

    const orderIndex = body?.order_index !== undefined && Number.isFinite(Number(body.order_index))
      ? Number(body.order_index) : page.order_index

    let parentPageId = page.parent_page_id
    if (body?.parent_page_id !== undefined) {
      parentPageId = null
      if (body.parent_page_id) {
        if (String(body.parent_page_id) === pageId) throw createError({ statusCode: 400, statusMessage: 'A page cannot be its own parent' })
        const parent = await client.query(
          'SELECT id FROM work.doc_pages WHERE id = $1 AND doc_id = $2', [String(body.parent_page_id), page.doc_id])
        if (!parent.rows.length) throw createError({ statusCode: 404, statusMessage: 'Parent page not found' })
        parentPageId = parent.rows[0].id
      }
    }

    const updated = await client.query(
      `UPDATE work.doc_pages
          SET title = $2, content = $3, order_index = $4, parent_page_id = $5,
              updated_at = now(), updated_by = $6, version = version + ${contentChanged ? 1 : 0}
        WHERE id = $1 RETURNING version`,
      [pageId, title, content, orderIndex, parentPageId, user.username])
    return { id: pageId, version: updated.rows[0].version }
  })
})
