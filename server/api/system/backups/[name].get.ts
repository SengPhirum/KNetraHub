import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { requireRole } from '~~/server/utils/auth'
import { backupDir, isSafeBackupName } from '~~/server/utils/backups'

/** GET /api/system/backups/:name — download a backup file (admin). */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  if (!isSafeBackupName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid backup filename' })

  const file = join(backupDir(), name)
  const s = await stat(file).catch(() => null)
  if (!s?.isFile()) throw createError({ statusCode: 404, statusMessage: 'backup not found' })

  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="${name}"`)
  setHeader(event, 'Content-Length', s.size)
  return sendStream(event, createReadStream(file))
})
