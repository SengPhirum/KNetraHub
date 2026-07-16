import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring } from '../../../../../../utils/monApi'
import { replayDead } from '../../../../../../jobs/queue'

/** POST /api/monitoring/v1/pollers/jobs/:id/replay — requeue a dead-letter job (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const ok = await replayDead(db, id)
  if (!ok) notFound('failed/dead job')
  await auditMonitoring(user.username, 'job.replay', String(id))
  return { id, requeued: true }
})
