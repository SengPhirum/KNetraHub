import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { revokeRunner } from '~~/layers/pam/server/utils/pamRunner'

/** Revoke a runner: disables it and invalidates its token immediately. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.connector.manage')
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'runner id required' })
  await revokeRunner(id)
  await pamAudit(event, user, { action: 'runner.revoke', objectType: 'runner', objectId: id, severity: 'warning' })
  return { ok: true }
})
