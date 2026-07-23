import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'
import { assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'

/** Revoke a user's access to a private space (work.share, full access). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWorkPermission(event, 'work.share')
  const spaceId = String(getRouterParam(event, 'id'))
  const username = String(getRouterParam(event, 'username') || '').toLowerCase()
  const { space } = await assertSpaceAccess(user, tier, workspaceId, spaceId, 'full')
  await getWork().query('DELETE FROM work.space_members WHERE space_id = $1 AND lower(username) = $2', [spaceId, username])
  await workAudit(user, 'space.unshared', spaceId, `${space.name}: ${username}`)
  return { ok: true }
})
