import { requirePermission } from '~~/server/utils/auth'
import { addRegistry, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'docker.registry.manage')
  const b = await readBody<any>(event)
  const auth = Buffer.from(`${b.username}:${b.password}`).toString('base64')
  const r = await addRegistry({ name: b.name, url: b.url, username: b.username, auth })
  await audit({ actor: user.username, action: 'registry.add', target: b.name })
  const { auth: _a, ...safe } = r
  return safe
})
