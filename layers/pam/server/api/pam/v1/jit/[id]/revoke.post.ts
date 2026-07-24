import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { revokeJit } from '~~/layers/pam/server/utils/pamJit'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.request.approve')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const res = await revokeJit(id, String(body?.reason || 'manual'))
  await pamAudit(event, user, { action: 'jit.revoke', objectType: 'jit', objectId: id, severity: res.ok ? 'notice' : 'high', result: res.ok ? 'success' : 'failure', details: res })
  return res
})
