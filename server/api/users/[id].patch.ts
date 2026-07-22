import { requireRole } from '~~/server/utils/auth'
import { updateUser, getUserById, audit } from '~~/server/utils/store'
import { enforcePasswordPolicy } from '~~/server/utils/passwordPolicy'
import { firePortalAlert } from '~~/server/utils/portalAlertNotify'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  if (typeof body?.password === 'string' && body.password) await enforcePasswordPolicy(body.password)
  // Snapshot the role first so a privilege change can be reported precisely.
  const before = await getUserById(id).catch(() => null)
  const u = await updateUser(id, body)
  await audit({ actor: admin.username, action: 'user.update', target: u.username })

  if (before && before.role !== u.role) {
    void firePortalAlert({
      ruleType: 'user_role_changed',
      target: u.username,
      severity: 'critical',
      vars: { target: u.username, from: before.role, to: u.role, actor: admin.username, time: new Date().toISOString() }
    })
  }
  return u
})
