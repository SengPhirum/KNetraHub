import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
import { STACK_LABEL } from '~~/server/utils/stack'
import { summarizeServices } from '~~/server/utils/resourceServices'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()

  const name = getRouterParam(event, 'name')!
  const docker = useDocker()
  const volume: any = await docker.getVolume(name).inspect().catch((err: any) => {
    throw createError({ statusCode: err?.statusCode || 404, statusMessage: err?.reason || err?.message || 'Volume not found' })
  })
  const volumeName = volume.Name || name

  const [services, tasks] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listTasks().catch(() => [])
  ])
  const attachedServices = (services as any[]).filter((service) =>
    (service.Spec?.TaskTemplate?.ContainerSpec?.Mounts || []).some((mount: any) =>
      mount.Type === 'volume' && mount.Source === volumeName
    )
  )

  return {
    name: volumeName,
    driver: volume.Driver || null,
    scope: volume.Scope || null,
    mountpoint: volume.Mountpoint || null,
    created: volume.CreatedAt || null,
    labels: volume.Labels || {},
    options: volume.Options || {},
    stack: volume.Labels?.[STACK_LABEL] || null,
    services: summarizeServices(attachedServices, tasks as any[])
  }
})
