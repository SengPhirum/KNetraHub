import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { enqueue } from '../../../../jobs/queue'

const ACTIONS = ['poll', 'discover', 'enable', 'disable', 'ignore', 'unignore', 'delete'] as const
type BulkAction = (typeof ACTIONS)[number]

/**
 * POST /api/monitoring/v1/devices/bulk — multi-select device actions.
 * Body: { ids: number[], action: poll|discover|enable|disable|ignore|unignore|delete }
 * poll/discover need the operator tier; the rest need admin.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const action = String(body?.action ?? '') as BulkAction
  if (!ACTIONS.includes(action)) badRequest(`action must be one of ${ACTIONS.join(', ')}`)
  const tier = action === 'poll' || action === 'discover' ? 'operator' : 'admin'
  const user = await requireMonitoring(event, tier)

  const db = await monDb()
  const ids: number[] = Array.isArray(body?.ids) ? [...new Set(body.ids.map(Number).filter(Number.isInteger))] : []
  if (!ids.length) badRequest('ids (non-empty array) is required')
  if (ids.length > 1000) badRequest('too many ids (max 1000)')

  const devices = await db.query(
    `SELECT id, poller_group FROM monitoring.devices WHERE id = ANY($1::bigint[])`,
    [ids]
  )
  let affected = 0

  switch (action) {
    case 'poll':
    case 'discover': {
      const jobType = action === 'poll' ? 'poll' : 'discovery'
      const stampCol = action === 'poll' ? 'next_poll_at' : 'next_discovery_at'
      for (const dev of devices.rows) {
        await db.query(`UPDATE monitoring.devices SET ${stampCol} = now() WHERE id = $1`, [dev.id])
        await enqueue(db, {
          type: jobType, deviceId: Number(dev.id), pollerGroup: Number(dev.poller_group),
          dedupeKey: `${jobType}:${dev.id}`, priority: 5
        })
        affected++
      }
      break
    }
    case 'disable': {
      const res = await db.query(
        `UPDATE monitoring.devices SET disabled = true, status = 'disabled',
           status_reason = 'disabled by operator', updated_at = now()
         WHERE id = ANY($1::bigint[]) AND NOT disabled`,
        [ids]
      )
      affected = res.rowCount ?? 0
      break
    }
    case 'enable': {
      const res = await db.query(
        `UPDATE monitoring.devices SET disabled = false, status = 'pending', status_reason = NULL,
           next_poll_at = now(), next_discovery_at = now(), updated_at = now()
         WHERE id = ANY($1::bigint[]) AND disabled`,
        [ids]
      )
      affected = res.rowCount ?? 0
      break
    }
    case 'ignore': {
      const res = await db.query(
        `UPDATE monitoring.devices SET ignored = true, updated_at = now() WHERE id = ANY($1::bigint[]) AND NOT ignored`,
        [ids]
      )
      affected = res.rowCount ?? 0
      break
    }
    case 'unignore': {
      const res = await db.query(
        `UPDATE monitoring.devices SET ignored = false, updated_at = now() WHERE id = ANY($1::bigint[]) AND ignored`,
        [ids]
      )
      affected = res.rowCount ?? 0
      break
    }
    case 'delete': {
      const res = await db.query(`DELETE FROM monitoring.devices WHERE id = ANY($1::bigint[])`, [ids])
      affected = res.rowCount ?? 0
      break
    }
  }

  await auditMonitoring(user.username, `device.bulk_${action}`, String(affected), `ids=${ids.join(',')}`)
  return { action, affected }
})
