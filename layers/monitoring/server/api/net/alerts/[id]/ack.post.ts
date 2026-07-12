import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Acknowledge / un-acknowledge an alert (PRTG-style). Acknowledging records who
// and when but leaves the alert active — the poller still recovers it on its own
// when the underlying condition clears.
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ acknowledged?: boolean }>(event)
  const ack = body.acknowledged !== false
  const by = user.displayName || user.username

  const db = getDb()
  await db.query(
    'UPDATE net_alerts SET acknowledged_at = $1, acknowledged_by = $2 WHERE id = $3',
    [ack ? new Date().toISOString() : null, ack ? by : null, id]
  )
  return { success: true, acknowledged: ack }
})
