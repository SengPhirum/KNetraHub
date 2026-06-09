import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ availability?: string; role?: string; labels?: Record<string,string> }>(event)
  const docker = useDocker()
  const node = docker.getNode(id)
  const info = await node.inspect()
  const spec = { ...info.Spec }
  if (body.availability) spec.Availability = body.availability as any
  if (body.role) spec.Role = body.role as any
  if (body.labels) spec.Labels = body.labels
  await node.update({ version: info.Version!.Index, ...spec })
  await audit({ actor: user.username, action: 'node.update', target: info.Description?.Hostname, detail: JSON.stringify(body) })
  return { ok: true }
})
