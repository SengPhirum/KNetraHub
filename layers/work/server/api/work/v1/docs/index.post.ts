import {
  getWork, newId, optionalText, recordActivity, requestId,
  requireText, requireWorkPermission, withWorkTx
} from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Create a doc (workspace-level or space-scoped) with its first page. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.docs')
  const body = await readBody(event)
  const title = requireText(body?.title, 'Doc title', 200)

  let spaceId: string | null = null
  if (body?.space_id) {
    const { space } = await assertSpaceAccess(user, tier, workspaceId, String(body.space_id), 'edit')
    spaceId = space.id
  }

  const docId = newId()
  const pageId = newId()
  await withWorkTx(async (client) => {
    await client.query(
      `INSERT INTO work.docs (id, workspace_id, space_id, title, icon, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [docId, workspaceId, spaceId, title, optionalText(body?.icon, 'Icon', 60), user.username])
    await client.query(
      `INSERT INTO work.doc_pages (id, doc_id, title, content, order_index, created_by, updated_by)
       VALUES ($1,$2,$3,'',10,$4,$4)`,
      [pageId, docId, title, user.username])
    await recordActivity(client, {
      workspaceId, entityType: 'doc', entityId: docId, actor: user.username,
      action: 'created', detail: title, requestId: requestId(event)
    })
  })
  return { id: docId, first_page_id: pageId }
})
