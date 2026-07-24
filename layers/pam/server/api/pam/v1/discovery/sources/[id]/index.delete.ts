import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { deleteSource } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const id = getRouterParam(event, 'id')!
  await deleteSource(id)
  await pamAudit(event, user, { action: 'discovery.source.delete', objectType: 'discovery_source', objectId: id, severity: 'warning' })
  return { ok: true }
})
