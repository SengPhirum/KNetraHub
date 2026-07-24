import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { createSchedule, type ReportFormat } from '~~/layers/pam/server/utils/pamReports'

const FORMATS = ['csv', 'xlsx', 'pdf', 'json']

/** Create a scheduled report delivery (pam.report.manage). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.report.manage')
  const body = await readBody(event)
  const reportKey = String(body?.report_key || '').trim()
  const format = String(body?.format || 'csv') as ReportFormat
  if (!reportKey) throw createError({ statusCode: 400, statusMessage: 'report_key is required' })
  if (!FORMATS.includes(format)) throw createError({ statusCode: 400, statusMessage: `format must be one of ${FORMATS.join(', ')}` })
  try {
    const id = await createSchedule({
      reportKey, format,
      intervalSeconds: Number(body?.interval_seconds) || undefined,
      channel: body?.channel ?? 'notification', actor: user.username
    })
    return { id }
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err?.message || 'failed to create schedule' })
  }
})
