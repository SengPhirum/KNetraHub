import { getWork, newId, requireWorkPermission, withWorkTx } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Restore a page to an earlier version. The current state is versioned first,
 * then the chosen version's title/content are copied forward — history is
 * append-only and never rewritten.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const pageId = String(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const targetVersion = Number(body?.version)
  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    throw createError({ statusCode: 400, statusMessage: 'version must be a positive integer' })
  }

  return withWorkTx(async (client) => {
    const { rows } = await client.query('SELECT * FROM work.doc_pages WHERE id = $1 FOR UPDATE', [pageId])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
    const page = rows[0]
    await assertDocAccess(user, tier, workspaceId, page.doc_id, 'edit', client)

    const { rows: versions } = await client.query(
      'SELECT * FROM work.doc_page_versions WHERE page_id = $1 AND version = $2', [pageId, targetVersion])
    if (!versions.length) throw createError({ statusCode: 404, statusMessage: 'Version not found' })
    const target = versions[0]

    await client.query(
      `INSERT INTO work.doc_page_versions (id, page_id, version, title, content, saved_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (page_id, version) DO NOTHING`,
      [newId(), pageId, page.version, page.title, page.content, page.updated_by || page.created_by])
    const updated = await client.query(
      `UPDATE work.doc_pages SET title = $2, content = $3, updated_at = now(), updated_by = $4, version = version + 1
        WHERE id = $1 RETURNING version`,
      [pageId, target.title, target.content, user.username])
    return { id: pageId, version: updated.rows[0].version, restored_from: targetVersion }
  })
})
