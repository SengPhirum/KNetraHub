import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listRuns } from '~~/layers/pam/server/utils/pamReports'

/** History of generated report runs (evidence snapshots), newest first. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.view')
  const q = getQuery(event)
  const key = q.key ? String(q.key) : null
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  return listRuns(key, limit)
})
