import { requireUser } from '~~/server/utils/auth'
import { getMaintenanceSettings } from '~~/server/utils/maintenanceSettings'

/**
 * GET /api/system/maintenance — current banner + maintenance-mode state.
 * Any signed-in user may read it: the app shell needs it to render the
 * notification banner and (for non-admins) the maintenance lockout page.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getMaintenanceSettings()
})
