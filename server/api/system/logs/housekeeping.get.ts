import { requireRole } from '~~/server/utils/auth'
import { getLogHousekeeping } from '~~/server/utils/moduleLogs'

/** Log retention config - portal (super) admin only. */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  return await getLogHousekeeping()
})
