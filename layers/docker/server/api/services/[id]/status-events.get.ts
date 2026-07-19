import { requireUser } from '~~/server/utils/auth'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const { rows } = await getDb().query(
    'SELECT * FROM service_status_events WHERE service_id = $1 ORDER BY time DESC LIMIT 100',
    [id]
  )
  return {
    events: rows.map((r: any) => ({
      time: r.time,
      serviceId: r.service_id,
      serviceName: r.service_name,
      taskId: r.task_id,
      nodeId: r.node_id,
      status: r.status,
      message: r.message ?? undefined
    }))
  }
})
