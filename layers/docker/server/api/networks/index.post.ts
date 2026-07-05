import { requireRole } from '~~/server/utils/auth'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const b = await readBody<any>(event)
  const net = await useDocker().createNetwork({
    Name: b.name, Driver: b.driver || 'overlay',
    Attachable: b.attachable ?? true, Internal: b.internal ?? false,
    EnableIPv6: b.ipv6 ?? false,
    IPAM: b.subnet ? { Config: [{ Subnet: b.subnet }] } : undefined
  })
  await audit({ actor: user.username, action: 'network.create', target: b.name })
  return { id: net.id }
})
