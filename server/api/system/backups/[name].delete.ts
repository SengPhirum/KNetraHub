import { requireRole } from '~~/server/utils/auth'
import { backupTargetFromName, deleteBackup, logBackupOp } from '~~/server/utils/backups'
import { audit } from '~~/server/utils/store'

/** DELETE /api/system/backups/:name — delete a backup file (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  const target = backupTargetFromName(name)
  await deleteBackup(name)
  await logBackupOp({ operation: 'delete', target, filename: name, actor: user.username, status: 'success' })
  await audit({ actor: user.username, action: 'system.backup.delete', target: name })
  return { deleted: name }
})
