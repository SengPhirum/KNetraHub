import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { suspendOrg } from '~~/layers/pam/server/utils/pamVendor'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.safe.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  await suspendOrg(id, String(body?.reason || 'manual'))
  await pamAudit(event, user, { action: 'vendor.org.suspend', objectType: 'vendor', objectId: id, severity: 'warning', reason: body?.reason })
  return { ok: true }
})
