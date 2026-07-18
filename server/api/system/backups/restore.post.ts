import { writeFile, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { requireRole } from '~~/server/utils/auth'
import {
  ensureBackupDir, backupDir, isSafeBackupName, restoreDatabaseBackup, logBackupOp
} from '~~/server/utils/backups'
import { audit } from '~~/server/utils/store'

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
  let uploadedTemp: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const upload = parts?.find((p) => p.name === 'file' && p.data?.length)
    if (!upload) throw createError({ statusCode: 400, statusMessage: 'multipart field "file" (.dump) is required' })
    filename = upload.filename || 'upload.dump'
    if (!filename.endsWith('.dump')) throw createError({ statusCode: 400, statusMessage: 'only .dump files can be restored' })
    const dir = await ensureBackupDir()
    uploadedTemp = join(dir, `.restore-${Date.now()}.dump`)
    await writeFile(uploadedTemp, upload.data)
    file = uploadedTemp
  } else {
    const body = await readBody<{ name?: string }>(event)
    const name = String(body?.name ?? '')
    if (!isSafeBackupName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid backup filename' })
    file = join(backupDir(), name)
    filename = name
    const s = await stat(file).catch(() => null)
    if (!s?.isFile()) throw createError({ statusCode: 404, statusMessage: 'backup not found' })
  }

  try {
    const size = (await stat(file)).size
    await restoreDatabaseBackup(file)
    await logBackupOp({
      operation: 'restore', target: 'database', filename, actor: user.username,
      sizeBytes: size, status: 'success'
    })
    await audit({ actor: user.username, action: 'system.backup.restore', target: filename })
    return { restored: filename }
  } catch (err: any) {
    const detail = String(err?.message ?? err)
    await logBackupOp({ operation: 'restore', target: 'database', filename, actor: user.username, status: 'failed', detail })
      .catch(() => { /* the restore may have dropped the table mid-flight */ })
    throw createError({ statusCode: 500, statusMessage: `Restore failed: ${detail}` })
  } finally {
    if (uploadedTemp) await unlink(uploadedTemp).catch(() => {})
  }
})
