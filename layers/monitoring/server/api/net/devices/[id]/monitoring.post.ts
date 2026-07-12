import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Pause / resume monitoring for a device (PRTG-style). A paused device is
// skipped by the poller (server/plugins/netPoller.ts) and shown as "paused"
// instead of flapping to "down". Resuming resets it to "unknown" so the next
// poll cycle fills in the real status.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'operator')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ enabled?: boolean }>(event)
  const enabled = body.enabled !== false

  const db = getDb()
  const exists = await db.query('SELECT id FROM net_devices WHERE id = $1', [id])
  if (!exists.rows.length) throw createError({ statusCode: 404, statusMessage: 'Device not found' })

  await db.query(
    'UPDATE net_devices SET monitoring_enabled = $1, status = $2 WHERE id = $3',
    [enabled, enabled ? 'unknown' : 'paused', id]
  )

  // Pausing clears any open "device down" alert so it doesn't linger while the
  // device is intentionally offline.
  if (!enabled) {
    await db.query(
      `UPDATE net_alerts SET status = 'recovered' WHERE device_id = $1 AND status = 'active' AND message LIKE 'Device down%'`,
      [id]
    )
  }

  return { success: true, monitoring_enabled: enabled }
})
