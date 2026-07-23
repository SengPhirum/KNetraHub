import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { PAM_REPORTS } from './[key].get'

/** Catalog of available PAM reports (pam.report.view). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.view')
  return PAM_REPORTS
})
