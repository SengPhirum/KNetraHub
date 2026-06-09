import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const node = await docker.getNode(id).inspect()
  const tasks = await docker.listTasks({ filters: JSON.stringify({ node: [id] }) })
  return { node, tasks }
})
