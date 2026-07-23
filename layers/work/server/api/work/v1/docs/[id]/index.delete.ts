import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** Permanently delete a doc and all pages/versions (admin: work.delete). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.delete')
  const docId = String(getRouterParam(event, 'id'))
  const { doc } = await assertDocAccess(user, tier, workspaceId, docId, 'full')
  const db = getWork()
  const pages = await db.query('SELECT count(*)::int AS n FROM work.doc_pages WHERE doc_id = $1', [docId])
  await db.query('DELETE FROM work.docs WHERE id = $1 AND workspace_id = $2', [docId, workspaceId])
  await workAudit(user, 'doc.deleted', docId, `${doc.title} (${pages.rows[0].n} page(s) permanently removed)`)
  return { deleted: true, pages: pages.rows[0].n }
})
