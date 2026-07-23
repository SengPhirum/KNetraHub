import { getWork, newId, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

const ACCESS_LEVELS = ['view', 'comment', 'edit', 'full']

/** Grant/replace a user's access to a private space (work.share, full access). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.share')
  const spaceId = String(getRouterParam(event, 'id'))
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'full')
  const body = await readBody(event)
  const username = String(body?.username || '').trim().toLowerCase()
  if (!username) throw createError({ statusCode: 400, statusMessage: 'username is required' })
  const access = ACCESS_LEVELS.includes(String(body?.access)) ? String(body.access) : 'edit'

  const db = getWork()
  const member = await db.query(
    'SELECT 1 FROM work.workspace_members WHERE workspace_id = $1 AND lower(username) = $2', [workspaceId, username])
  if (!member.rows.length) {
    throw createError({ statusCode: 400, statusMessage: 'User is not a Work member yet — they appear here after their first sign-in to Work' })
  }
  await db.query(
    `INSERT INTO work.space_members (id, space_id, username, access, added_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (space_id, username) DO UPDATE SET access = EXCLUDED.access, added_by = EXCLUDED.added_by, added_at = now()`,
    [newId(), spaceId, username, access, user.username])
  await workAudit(user, 'space.shared', spaceId, `${space.name}: ${username} → ${access}`)
  return { ok: true }
})
