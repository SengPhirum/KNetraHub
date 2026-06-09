import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const containers = await useDocker().listContainers({ all: true })
  return containers.map((c) => ({
    id: c.Id, name: (c.Names?.[0] || '').replace(/^\//, ''),
    image: c.Image, state: c.State, status: c.Status,
    created: c.Created, ports: c.Ports
  }))
})
