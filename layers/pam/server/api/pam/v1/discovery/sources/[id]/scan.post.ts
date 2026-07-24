import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { runScan } from '~~/layers/pam/server/utils/pamDiscovery'

/** Start a discovery scan. In-process connectors resolve synchronously; runner
 * connectors are dispatched and the run finalizes when the runner reports. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.run')
  const id = getRouterParam(event, 'id')!
  const result = await runScan(id, { actor: user.username, trigger: 'manual' })
  await pamAudit(event, user, { action: 'discovery.scan', objectType: 'discovery_source', objectId: id, severity: 'notice', details: result })
  return result
})
