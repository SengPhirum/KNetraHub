import { requireRole } from '~~/server/utils/auth'
import { useDocker, throwDockerError } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const b = await readBody<any>(event)
  const v = await useDocker().createVolume({ Name: b.name, Driver: b.driver || 'local' })
    .catch((err: any) => throwDockerError(err, `Failed to create volume "${b.name}"`))
  await audit({ actor: user.username, action: 'volume.create', target: b.name })
  return { name: (v as any).Name }
})
