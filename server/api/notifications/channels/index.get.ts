import { requireRole } from '~~/server/utils/auth'
import { listChannels } from '~~/server/utils/notifyStore'

/** Central notification channels (summaries only - config is never returned). */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const scope = getQuery(event).scope
  return await listChannels(typeof scope === 'string' && scope ? scope : undefined)
})
