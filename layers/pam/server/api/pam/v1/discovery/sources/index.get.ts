import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listSources } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  return { sources: await listSources() }
})
