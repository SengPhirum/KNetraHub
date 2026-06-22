import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'

interface PortInput {
  target: number
  published?: number
  protocol?: 'tcp' | 'udp'
  mode?: 'ingress' | 'host'
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { ports } = await readBody<{ ports: PortInput[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    // Preserve the existing EndpointSpec.Mode (vip/dnsrr) - only the Ports
    // list is being edited here.
    spec.EndpointSpec = {
      ...(spec.EndpointSpec || {}),
      Ports: (ports || [])
        .filter((p) => p.target)
        .map((p) => ({
          TargetPort: Number(p.target),
          PublishedPort: p.published ? Number(p.published) : undefined,
          Protocol: p.protocol || 'tcp',
          PublishMode: p.mode || 'ingress'
        }))
    }
  })
  await audit({ actor: user.username, action: 'service.update-ports', target: info.Spec.Name })
  return { ok: true }
})
