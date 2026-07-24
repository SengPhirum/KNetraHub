import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { deleteSchedule } from '~~/layers/pam/server/utils/pamReports'

/** Delete a scheduled report (pam.report.manage). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.manage')
  const id = getRouterParam(event, 'id')!
  await deleteSchedule(id)
  return { ok: true }
})
