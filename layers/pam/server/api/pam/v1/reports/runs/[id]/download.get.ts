import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { getRunContent } from '~~/layers/pam/server/utils/pamReports'

/** Re-download a stored report run byte-for-byte (with its integrity checksum). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.export')
  const id = getRouterParam(event, 'id')!
  const file = await getRunContent(id)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'Report run not found' })
  setResponseHeaders(event, {
    'content-type': file.format === 'csv' ? 'text/csv; charset=utf-8'
      : file.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : file.format === 'pdf' ? 'application/pdf' : 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${file.filename}"`,
    'x-pam-report-checksum': file.checksum,
    'cache-control': 'no-store'
  })
  return file.content
})
