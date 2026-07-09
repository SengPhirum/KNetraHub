import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { summarizeServices } from '~~/layers/docker/server/utils/resourceServices'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  const id = getRouterParam(event, 'id')!
  return computeConfigDetail(id)
})

export async function computeConfigDetail(id: string) {
  const docker = useDocker()
  const config: any = await docker.getConfig(id).inspect().catch((err: any) => {
    throw createError({ statusCode: err?.statusCode || 404, statusMessage: err?.reason || err?.message || 'Config not found' })
  })
  const configName = config.Spec?.Name || id

  const [services, tasks] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listTasks().catch(() => [])
  ])
  const attachedServices = (services as any[]).filter((service) =>
    (service.Spec?.TaskTemplate?.ContainerSpec?.Configs || []).some((c: any) =>
      c.ConfigID === config.ID || c.ConfigName === configName
    )
  )

  return {
    id: config.ID,
    name: configName,
    labels: config.Spec?.Labels || {},
    stack: config.Spec?.Labels?.[STACK_LABEL] || null,
    created: config.CreatedAt || null,
    updated: config.UpdatedAt || null,
    data: config.Spec?.Data ? Buffer.from(config.Spec.Data, 'base64').toString('utf8') : '',
    services: summarizeServices(attachedServices, tasks as any[])
  }
}
