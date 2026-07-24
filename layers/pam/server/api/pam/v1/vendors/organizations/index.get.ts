import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listOrgs } from '~~/layers/pam/server/utils/pamVendor'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.safe.manage')
  return { organizations: await listOrgs() }
})
