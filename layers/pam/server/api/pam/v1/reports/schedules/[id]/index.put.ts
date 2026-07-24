import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { updateSchedule, type ReportFormat } from '~~/layers/pam/server/utils/pamReports'

/** Enable/disable or adjust a scheduled report (pam.report.manage). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  await updateSchedule(id, {
    enabled: body?.enabled === undefined ? undefined : body.enabled === true,
    intervalSeconds: body?.interval_seconds === undefined ? undefined : Number(body.interval_seconds),
    channel: body?.channel,
    format: body?.format as ReportFormat | undefined
  })
  return { ok: true }
})
