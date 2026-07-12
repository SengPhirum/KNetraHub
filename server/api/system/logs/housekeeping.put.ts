import { requireRole } from '~~/server/utils/auth'
import { setLogHousekeeping, runLogHousekeeping, type LogHousekeeping } from '~~/server/utils/moduleLogs'

/** Update log retention config and apply it immediately - portal (super)
 *  admin only. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<LogHousekeeping>(event)
  const saved = await setLogHousekeeping(body, user.username)
  const trimmed = await runLogHousekeeping()
  return { ...saved, ...trimmed }
})
