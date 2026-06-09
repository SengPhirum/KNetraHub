import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const svc = docker.getService(id)
  const info = await svc.inspect()
  const spec = { ...info.Spec }
  spec.TaskTemplate = { ...spec.TaskTemplate, ForceUpdate: (spec.TaskTemplate?.ForceUpdate || 0) + 1 }
  await svc.update({ version: info.Version!.Index, ...spec })
  await audit({ actor: user.username, action: 'service.redeploy', target: info.Spec.Name })
  return { ok: true }
})
