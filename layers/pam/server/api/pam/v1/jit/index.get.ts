import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listJit } from '~~/layers/pam/server/utils/pamJit'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.request.view')
  return { entitlements: await listJit() }
})
