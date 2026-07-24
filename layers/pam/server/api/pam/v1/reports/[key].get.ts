import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { generateReport } from '~~/layers/pam/server/utils/pamReports'

/**
 * Server-rendered PAM report data (pam.report.view). The report catalog + fixed
 * SQL live in pamReports.ts (shared with the generator/scheduler). Table and
 * column names are fixed literals — never derived from request input.
 */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.view')
  const key = getRouterParam(event, 'key')!
  try {
    return await generateReport(key, undefined)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Unknown report' })
  }
})
