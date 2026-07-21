import { requireRole } from '~~/server/utils/auth'
import { listTemplates } from '~~/server/utils/notifyStore'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const scope = getQuery(event).scope
  return await listTemplates(typeof scope === 'string' && scope ? scope : undefined)
})
