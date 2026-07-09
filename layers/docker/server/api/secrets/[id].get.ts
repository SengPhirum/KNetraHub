import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { summarizeServices } from '~~/layers/docker/server/utils/resourceServices'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  const id = getRouterParam(event, 'id')!
  return computeSecretDetail(id)
})

export async function computeSecretDetail(id: string) {
  const docker = useDocker()
  const secret: any = await docker.getSecret(id).inspect().catch((err: any) => {
    throw createError({ statusCode: err?.statusCode || 404, statusMessage: err?.reason || err?.message || 'Secret not found' })
  })
  const secretName = secret.Spec?.Name || id

  const [services, tasks] = await Promise.all([
    docker.listServices().catch(() => []),
    docker.listTasks().catch(() => [])
  ])
  const attachedServices = (services as any[]).filter((service) =>
    (service.Spec?.TaskTemplate?.ContainerSpec?.Secrets || []).some((s: any) =>
      s.SecretID === secret.ID || s.SecretName === secretName
    )
  )

  return {
    id: secret.ID,
    name: secretName,
    labels: secret.Spec?.Labels || {},
    stack: secret.Spec?.Labels?.[STACK_LABEL] || null,
    created: secret.CreatedAt || null,
    updated: secret.UpdatedAt || null,
    services: summarizeServices(attachedServices, tasks as any[])
  }
}
