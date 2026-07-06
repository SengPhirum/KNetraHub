import { requirePermission } from '~~/server/utils/auth'
import { updateRegistry, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'docker.registry.manage')
  const id = getRouterParam(event, 'id')!
  const b = await readBody<any>(event)
  const auth = b.password ? Buffer.from(`${b.username}:${b.password}`).toString('base64') : undefined
  const r = await updateRegistry(id, { name: b.name, url: b.url, username: b.username, auth })
  if (!r) throw createError({ statusCode: 404, statusMessage: 'Registry not found' })
  await audit({ actor: user.username, action: 'registry.update', target: b.name })
  const { auth: _a, ...safe } = r
  return safe
})
