import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
import { STACK_LABEL } from '~~/server/utils/stack'
import { summarizeServices } from '~~/server/utils/resourceServices'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()

  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const network: any = await docker.getNetwork(id).inspect().catch((err: any) => {
    throw createError({ statusCode: err?.statusCode || 404, statusMessage: err?.reason || err?.message || 'Network not found' })
  })

  const [services, tasks] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listTasks().catch(() => [])
  ])
  const attachedServices = (services as any[]).filter((service) =>
    (service.Spec?.TaskTemplate?.Networks || []).some((n: any) => n.Target === network.Id || n.Target === id)
  )

  const ipamConfig = network.IPAM?.Config || []
  return {
    id: network.Id,
    name: network.Name,
    driver: network.Driver || null,
    scope: network.Scope || null,
    created: network.Created || null,
    internal: !!network.Internal,
    attachable: !!network.Attachable,
    ingress: !!network.Ingress,
    labels: network.Labels || {},
    stack: network.Labels?.[STACK_LABEL] || null,
    subnets: ipamConfig.map((c: any) => c.Subnet).filter(Boolean),
    gateways: ipamConfig.map((c: any) => c.Gateway).filter(Boolean),
    options: network.Options || {},
    services: summarizeServices(attachedServices, tasks as any[])
  }
})
