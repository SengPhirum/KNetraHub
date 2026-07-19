import { requireRole } from '~~/server/utils/auth'
import { listBackups, listBackupLog, listBackupTargets } from '~~/server/utils/backups'

/** GET /api/system/backups — available database backups + activity log (admin). */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const [backups, log, targets] = await Promise.all([listBackups(), listBackupLog(), listBackupTargets()])
  return { backups, log, targets }
})
