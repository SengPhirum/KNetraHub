import { getDb } from '../../../../utils/db'

// Pause / resume monitoring for a host (the poller skips paused hosts).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ enabled?: boolean }>(event)
  const enabled = body.enabled !== false
  const db = getDb()
  await db.query('UPDATE server_hosts SET monitoring_enabled = $1 WHERE id = $2', [enabled, id])
  return { success: true, monitoring_enabled: enabled }
})
