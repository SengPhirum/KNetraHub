import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { provisionJit } from '~~/layers/pam/server/utils/pamJit'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.request.approve')
  const id = getRouterParam(event, 'id')!
  const res = await provisionJit(id)
  await pamAudit(event, user, { action: 'jit.provision', objectType: 'jit', objectId: id, severity: res.ok ? 'notice' : 'high', result: res.ok ? 'success' : 'failure', details: res })
  return res
})
