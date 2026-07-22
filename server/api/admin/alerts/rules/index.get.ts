import { requireRole } from '~~/server/utils/auth'
import { getAllPortalAlertRules } from '~~/server/utils/portalAlertRules'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  return getAllPortalAlertRules()
})
