import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertDocAccess } from '~~/layers/work/server/utils/workAccess'

/** Doc detail: metadata + nested page tree (titles only; content is per page). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const docId = String(getRouterParam(event, 'id'))
  const { doc, access } = await assertDocAccess(user, tier, workspaceId, docId)
  const { rows: pages } = await getWork().query(
    `SELECT id, parent_page_id, title, order_index, updated_at, updated_by, version
       FROM work.doc_pages WHERE doc_id = $1 ORDER BY order_index, created_at`, [docId])

  const byParent = new Map<string | null, any[]>()
  for (const page of pages) {
    const key = page.parent_page_id || null
    const bucket = byParent.get(key) || []
    bucket.push(page)
    byParent.set(key, bucket)
  }
  const buildTree = (parentId: string | null): any[] =>
    (byParent.get(parentId) || []).map((page) => ({ ...page, children: buildTree(page.id) }))

  return { ...doc, access, pages: buildTree(null), page_count: pages.length }
})
