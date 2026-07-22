import { requireRole } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { deleteUser, getUserById, audit } from '~~/server/utils/store'
import { firePortalAlert } from '~~/server/utils/portalAlertNotify'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  await requireDeleteConfirm(event, 'user')
  const id = getRouterParam(event, 'id')!
  // Read the username before the row goes away so the alert names a person.
  const victim = await getUserById(id).catch(() => null)
  await deleteUser(id)
  await audit({ actor: admin.username, action: 'user.delete', target: id })

  void firePortalAlert({
    ruleType: 'user_deleted',
    target: victim?.username || id,
    severity: 'warning',
    vars: { target: victim?.username || id, actor: admin.username, time: new Date().toISOString() }
  })
  return { ok: true }
})
