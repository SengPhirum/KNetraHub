import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { runReportToStore, getRunContent, type ReportFormat } from '~~/layers/pam/server/utils/pamReports'

const FORMATS = ['csv', 'xlsx', 'pdf', 'json']

/**
 * Server-side generate a report, store it as an evidence snapshot (bytes +
 * sha256), and stream the file back for download. pam.report.export.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.report.export')
  const key = getRouterParam(event, 'key')!
  const body = await readBody(event).catch(() => ({}))
  const format = String(body?.format || 'csv') as ReportFormat
  if (!FORMATS.includes(format)) throw createError({ statusCode: 400, statusMessage: `format must be one of ${FORMATS.join(', ')}` })
  let run: any
  try {
    run = await runReportToStore(key, { format, actor: user.username })
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Unknown report' })
  }
  const file = await getRunContent(run.id)
  if (!file) throw createError({ statusCode: 500, statusMessage: 'Report generation produced no content' })
  setResponseHeaders(event, {
    'content-type': format === 'csv' ? 'text/csv; charset=utf-8'
      : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : format === 'pdf' ? 'application/pdf' : 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${file.filename}"`,
    'x-pam-report-checksum': file.checksum,
    'cache-control': 'no-store'
  })
  return file.content
})
