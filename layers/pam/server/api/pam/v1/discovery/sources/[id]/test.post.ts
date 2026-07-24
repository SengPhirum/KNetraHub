import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { testSource } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.run')
  const id = getRouterParam(event, 'id')!
  return testSource(id)
})
