import {
  getWork, newId, recordActivity, requestId, requireText,
  requireWorkPermission, workNotify
} from '~~/layers/work/server/utils/workStore'
import { assertTaskAccess } from '~~/layers/work/server/utils/workAccess'

/**
 * Add a comment (top-level or threaded reply). Supports assigned comments
 * (assigned_to) and @username mentions — both notify through the portal feed.
 * Bodies are stored as plain text and rendered inertly (no HTML execution).
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.comment')
  const taskId = String(getRouterParam(event, 'id'))
  const { task } = await assertTaskAccess(user, tier, workspaceId, taskId, 'comment')
  const body = await readBody(event)
  const text = requireText(body?.body, 'Comment', 20_000)
  const db = getWork()

  let parentId: string | null = null
  if (body?.parent_id) {
    const { rows } = await db.query(
      'SELECT id, parent_id FROM work.comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL', [String(body.parent_id), taskId])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Parent comment not found' })
    // One thread level: replying to a reply attaches to its root comment.
    parentId = rows[0].parent_id || rows[0].id
  }

  let assignedTo: string | null = null
  if (body?.assigned_to) {
    assignedTo = String(body.assigned_to).trim().toLowerCase()
    const member = await db.query(
      'SELECT 1 FROM work.workspace_members WHERE workspace_id = $1 AND lower(username) = $2', [workspaceId, assignedTo])
    if (!member.rows.length) throw createError({ statusCode: 400, statusMessage: 'Assigned user is not a Work member' })
  }

  const id = newId()
  await db.query(
    `INSERT INTO work.comments (id, workspace_id, task_id, parent_id, author, body, assigned_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, workspaceId, taskId, parentId, user.username, text, assignedTo])
  await db.query(
    'INSERT INTO work.task_followers (task_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [taskId, user.username.toLowerCase()])
  await recordActivity(db, {
    workspaceId, entityType: 'task', entityId: taskId, taskId, actor: user.username,
    action: 'commented', requestId: requestId(event)
  })

  // Mentions: @username tokens that match real workspace members.
  const mentioned = [...new Set([...text.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) => m[1]!.toLowerCase()))]
  if (mentioned.length) {
    const { rows } = await db.query(
      'SELECT username FROM work.workspace_members WHERE workspace_id = $1 AND lower(username) = ANY($2)', [workspaceId, mentioned])
    for (const row of rows) {
      if (row.username !== user.username.toLowerCase()) {
        await workNotify({
          event: 'comment_mention', target: taskId,
          title: 'You were mentioned', body: `${user.username} mentioned @${row.username} on "${task.name}"`
        })
      }
    }
  }
  if (assignedTo && assignedTo !== user.username.toLowerCase()) {
    await workNotify({
      event: 'comment_assigned', target: taskId,
      title: 'Comment assigned', body: `${user.username} assigned a comment to ${assignedTo} on "${task.name}"`
    })
  }
  return { id }
})
