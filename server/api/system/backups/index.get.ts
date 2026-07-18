import { requireRole } from '~~/server/utils/auth'
import { listBackups, listBackupLog } from '~~/server/utils/backups'

/** GET /api/system/backups — available database backups + activity log (admin). */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const [backups, log] = await Promise.all([listBackups(), listBackupLog()])
  return { backups, log }
})
