import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listSchedules } from '~~/layers/pam/server/utils/pamReports'

/** List scheduled report deliveries. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.view')
  return listSchedules()
})
