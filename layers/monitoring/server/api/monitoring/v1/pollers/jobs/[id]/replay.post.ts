import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, conflict, auditMonitoring } from '../../../../../../utils/monApi'
import { replayJob } from '../../../../../../jobs/queue'

/** POST /api/monitoring/v1/pollers/jobs/:id/replay — force a pending/failed/dead job to run now (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const result = await replayJob(db, id)
  if (result === 'not_found') notFound('pending/failed/dead job')
  if (result === 'conflict') conflict('a newer job for this device/type is already queued')
  await auditMonitoring(user.username, 'job.replay', String(id))
  return { id, requeued: true }
})
