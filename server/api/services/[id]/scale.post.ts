import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { replicas } = await readBody<{ replicas: number }>(event)
  const docker = useDocker()
  const svc = docker.getService(id)
  const info = await svc.inspect()
  if (!info.Spec.Mode?.Replicated) {
    throw createError({ statusCode: 400, statusMessage: 'Only replicated services can be scaled' })
  }
  const spec = { ...info.Spec }
  spec.Mode = { Replicated: { Replicas: Number(replicas) } }
  await svc.update({ version: info.Version!.Index, ...spec })
  await audit({ actor: user.username, action: 'service.scale', target: info.Spec.Name, detail: `replicas=${replicas}` })
  return { ok: true }
})
