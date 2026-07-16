import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../utils/monApi'
import { enqueue } from '../../../../../jobs/queue'

/** POST /api/monitoring/v1/devices/:id/poll — queue an immediate poll (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const dev = await db.query(`SELECT poller_group FROM monitoring.devices WHERE id = $1`, [id])
  if (!dev.rows.length) notFound('device')
  // Reset next_poll_at so the dispatcher also picks it up if the dedupe'd job races.
  await db.query(`UPDATE monitoring.devices SET next_poll_at = now() WHERE id = $1`, [id])
  await enqueue(db, { type: 'poll', deviceId: id, pollerGroup: Number(dev.rows[0].poller_group), dedupeKey: `poll:${id}`, priority: 5 })
  await auditMonitoring(user.username, 'device.poll', String(id))
  return { id, queued: true }
})
