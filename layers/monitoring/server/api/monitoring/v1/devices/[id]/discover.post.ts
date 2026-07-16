import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../utils/monApi'
import { enqueue } from '../../../../../jobs/queue'

/** POST /api/monitoring/v1/devices/:id/discover — queue immediate discovery (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const dev = await db.query(`SELECT poller_group FROM monitoring.devices WHERE id = $1`, [id])
  if (!dev.rows.length) notFound('device')
  await db.query(`UPDATE monitoring.devices SET next_discovery_at = now() WHERE id = $1`, [id])
  await enqueue(db, { type: 'discovery', deviceId: id, pollerGroup: Number(dev.rows[0].poller_group), dedupeKey: `discovery:${id}`, priority: 5 })
  await auditMonitoring(user.username, 'device.discover', String(id))
  return { id, queued: true }
})
