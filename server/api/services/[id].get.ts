import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const service = await docker.getService(id).inspect()
  const tasks = await docker.listTasks({ filters: JSON.stringify({ service: [id] }) })
  tasks.sort((a: any, b: any) => (b.CreatedAt || '').localeCompare(a.CreatedAt || ''))
  return { service, tasks }
})
