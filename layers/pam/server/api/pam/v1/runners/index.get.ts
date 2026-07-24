import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listRunnerHealth } from '~~/layers/pam/server/utils/pamRunner'

/** Runner fleet health for the admin dashboard. No secrets (token hashes are
 * never returned; only the non-sensitive prefix). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.connector.view')
  return { runners: await listRunnerHealth() }
})
