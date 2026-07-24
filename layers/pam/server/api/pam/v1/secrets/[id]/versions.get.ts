import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listVersions } from '~~/layers/pam/server/utils/pamSecrets'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.secret.manage')
  return { versions: await listVersions(getRouterParam(event, 'id')!) }
})
