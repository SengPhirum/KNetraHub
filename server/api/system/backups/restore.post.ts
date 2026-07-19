import { writeFile, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { requireRole } from '~~/server/utils/auth'
import {
  ensureBackupDir, backupDir, backupTargetFromName, isBackupTarget, isSafeBackupName,
  restoreDatabaseBackup, logBackupOp, type BackupTarget
} from '~~/server/utils/backups'
import { audit } from '~~/server/utils/store'
import {
  closeAllModuleDbs, closeModuleDb, refreshModuleDatabaseConfigs,
  resumeModuleRuntime, suspendModuleRuntime
} from '~~/server/utils/moduleDb'
import type { AppKey } from '~~/shared/utils/entitlements'
import { resumeMonitoringRuntime, suspendMonitoringRuntime } from '~~/layers/monitoring/server/plugins/monitoringBootstrap'

/**
 * POST /api/system/backups/restore — restore the database (admin).
 * Either multipart form-data with a `file` field (.dump upload), or JSON
 * { name } to restore one of the existing server-side backups. Restoring is
 * disruptive — enable Maintenance Mode first.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const contentType = getHeader(event, 'content-type') ?? ''

  let file: string
  let filename: string
  let target: BackupTarget
  let uploadedTemp: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const upload = parts?.find((p) => p.name === 'file' && p.data?.length)
    const targetPart = parts?.find((p) => p.name === 'target' && p.data?.length)
    if (!upload) throw createError({ statusCode: 400, statusMessage: 'multipart field "file" (.dump) is required' })
    filename = upload.filename || 'upload.dump'
    const requestedTarget = targetPart?.data?.toString('utf8')
    if (!isBackupTarget(requestedTarget)) throw createError({ statusCode: 400, statusMessage: 'A valid restore target is required' })
    target = requestedTarget
    if (!filename.endsWith('.dump')) throw createError({ statusCode: 400, statusMessage: 'only .dump files can be restored' })
    const dir = await ensureBackupDir()
    uploadedTemp = join(dir, `.restore-${Date.now()}.dump`)
    await writeFile(uploadedTemp, upload.data)
    file = uploadedTemp
  } else {
    const body = await readBody<{ name?: string; target?: BackupTarget }>(event)
    const name = String(body?.name ?? '')
    if (!isSafeBackupName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid backup filename' })
    file = join(backupDir(), name)
    filename = name
    const fileTarget = backupTargetFromName(name)
    target = body?.target || fileTarget
    if (!isBackupTarget(target)) throw createError({ statusCode: 400, statusMessage: 'Invalid restore target' })
    if (target !== fileTarget) {
      throw createError({ statusCode: 409, statusMessage: `This backup belongs to ${fileTarget}; cross-database restore is blocked` })
    }
    const s = await stat(file).catch(() => null)
    if (!s?.isFile()) throw createError({ statusCode: 404, statusMessage: 'backup not found' })
  }

  try {
    const size = (await stat(file)).size
    const suspendedTargets = target === 'portal' ? (['docker', 'monitoring', 'ipmgt'] as AppKey[]) : [target]
    for (const key of suspendedTargets) suspendModuleRuntime(key)
    if (target === 'portal' || target === 'monitoring') suspendMonitoringRuntime()
    if (target === 'portal') await closeAllModuleDbs()
    else await closeModuleDb(target)
    await restoreDatabaseBackup(target, file)
    await logBackupOp({
      operation: 'restore', target, filename, actor: user.username,
      sizeBytes: size, status: 'success'
    })
    await audit({ actor: user.username, action: 'system.backup.restore', target: filename })
    return { restored: filename }
  } catch (err: any) {
    const detail = String(err?.message ?? err)
    await logBackupOp({ operation: 'restore', target, filename, actor: user.username, status: 'failed', detail })
      .catch(() => { /* the restore may have dropped the table mid-flight */ })
    throw createError({ statusCode: 500, statusMessage: `Restore failed: ${detail}` })
  } finally {
    await refreshModuleDatabaseConfigs().catch(() => {})
    const suspendedTargets = target === 'portal' ? (['docker', 'monitoring', 'ipmgt'] as AppKey[]) : [target]
    for (const key of suspendedTargets) resumeModuleRuntime(key)
    if (target === 'portal' || target === 'monitoring') resumeMonitoringRuntime()
    if (uploadedTemp) await unlink(uploadedTemp).catch(() => {})
  }
})
