import { requireRole } from '~~/server/utils/auth'
import { createDatabaseBackup, isBackupTarget, logBackupOp, type BackupTarget } from '~~/server/utils/backups'
import { audit } from '~~/server/utils/store'

/** POST /api/system/backups — create a new database backup via pg_dump (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<{ target?: BackupTarget }>(event)
  const target = body?.target || 'portal'
  if (!isBackupTarget(target)) throw createError({ statusCode: 400, statusMessage: 'Invalid backup target' })
  try {
    const file = await createDatabaseBackup(target)
    await logBackupOp({
      operation: 'backup', target, filename: file.name,
      actor: user.username, sizeBytes: file.size_bytes, status: 'success'
    })
    await audit({ actor: user.username, action: 'system.backup.create', target: file.name })
    setResponseStatus(event, 201)
    return { created: file }
  } catch (err: any) {
    const detail = String(err?.message ?? err)
    await logBackupOp({ operation: 'backup', target, actor: user.username, status: 'failed', detail })
    throw createError({ statusCode: 500, statusMessage: `Backup failed: ${detail}` })
  }
})
