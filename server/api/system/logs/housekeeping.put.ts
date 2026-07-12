import { requireRole } from '~~/server/utils/auth'
import { setLogHousekeeping, runLogHousekeeping, logSystem, type LogHousekeeping } from '~~/server/utils/moduleLogs'

/** Update log retention config and apply it immediately - portal (super)
 *  admin only. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<LogHousekeeping>(event)
  const saved = await setLogHousekeeping(body, user.username)
  await logSystem('portal', 'info', 'logs.housekeeping.updated',
    `${user.username} set retention to activity ${saved.activityRetentionDays}d/${saved.activityMaxRows} rows, system ${saved.systemRetentionDays}d/${saved.systemMaxRows} rows`)
  const trimmed = await runLogHousekeeping()
  return { ...saved, ...trimmed }
})
