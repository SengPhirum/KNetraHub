import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const b = await readBody<{ name: string; data: string }>(event)
  const res = await useDocker().createSecret({ Name: b.name, Data: Buffer.from(b.data, 'utf8').toString('base64') })
  await audit({ actor: user.username, action: 'secret.create', target: b.name })
  return { id: (res as any).id || (res as any).ID }
})
